from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import math
from datetime import datetime, timedelta
from functools import wraps

app = Flask(__name__, static_folder='.')
app.secret_key = os.environ.get('SECRET_KEY', 'dfm-secret-key-2024-change-in-production')
DATABASE = 'dfm.db'

# ─── DATABASE ────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            streak INTEGER DEFAULT 0,
            last_assessment TEXT,
            badges TEXT DEFAULT '[]'
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            total_risk REAL NOT NULL,
            password_risk REAL NOT NULL,
            social_risk REAL NOT NULL,
            network_risk REAL NOT NULL,
            phishing_risk REAL NOT NULL,
            device_risk REAL NOT NULL,
            stability_index REAL DEFAULT 100,
            anomaly INTEGER DEFAULT 0,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL
        )
    ''')
    # Seed admin
    try:
        c.execute("INSERT OR IGNORE INTO admin_users (username) VALUES ('admin')")
    except:
        pass
    conn.commit()
    conn.close()

# ─── DECORATORS ──────────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        conn = get_db()
        row = conn.execute('SELECT username FROM users WHERE id=?', (session['user_id'],)).fetchone()
        conn.close()
        if not row:
            return jsonify({'error': 'Unauthorized'}), 401
        admin = get_db().execute('SELECT id FROM admin_users WHERE username=?', (row['username'],)).fetchone()
        get_db().close()
        if not admin:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated

# ─── AUTH ROUTES ─────────────────────────────────────────────────────────────

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    conn = get_db()
    existing = conn.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Username already taken'}), 409
    pw_hash = generate_password_hash(password)
    now = datetime.utcnow().isoformat()
    conn.execute('INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)',
                 (username, pw_hash, now))
    conn.commit()
    user = conn.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()
    conn.close()
    session['user_id'] = user['id']
    session['username'] = username
    return jsonify({'message': 'Registered successfully', 'username': username}), 201

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
    conn.close()
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Invalid credentials'}), 401
    session['user_id'] = user['id']
    session['username'] = username
    return jsonify({'message': 'Login successful', 'username': username}), 200

@app.route('/logout', methods=['GET', 'POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'}), 200

@app.route('/me', methods=['GET'])
@login_required
def me():
    conn = get_db()
    user = conn.execute('SELECT id, username, created_at, streak, badges FROM users WHERE id=?',
                        (session['user_id'],)).fetchone()
    conn.close()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'created_at': user['created_at'],
        'streak': user['streak'],
        'badges': user['badges']
    })

# ─── ASSESSMENT ROUTES ───────────────────────────────────────────────────────

@app.route('/save_assessment', methods=['POST'])
@login_required
def save_assessment():
    data = request.get_json()
    uid = session['user_id']
    total_risk    = float(data.get('total_risk', 0))
    password_risk = float(data.get('password_risk', 0))
    social_risk   = float(data.get('social_risk', 0))
    network_risk  = float(data.get('network_risk', 0))
    phishing_risk = float(data.get('phishing_risk', 0))
    device_risk   = float(data.get('device_risk', 0))
    now = datetime.utcnow().isoformat()

    conn = get_db()
    # Fetch last 3 assessments for stability + anomaly
    history = conn.execute(
        'SELECT total_risk FROM assessments WHERE user_id=? ORDER BY timestamp DESC LIMIT 3',
        (uid,)
    ).fetchall()
    risks = [r['total_risk'] for r in history]

    # Stability index: std dev of last 3 + current
    all_risks = [total_risk] + risks
    if len(all_risks) >= 2:
        mean = sum(all_risks) / len(all_risks)
        variance = sum((x - mean)**2 for x in all_risks) / len(all_risks)
        std = math.sqrt(variance)
        stability = max(0, 100 - std)
    else:
        stability = 100.0

    # Anomaly detection
    anomaly = 0
    if risks:
        prev = risks[0]
        if abs(total_risk - prev) > 15:
            anomaly = 1

    conn.execute('''
        INSERT INTO assessments
        (user_id, total_risk, password_risk, social_risk, network_risk, phishing_risk, device_risk, stability_index, anomaly, timestamp)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    ''', (uid, total_risk, password_risk, social_risk, network_risk, phishing_risk, device_risk,
          round(stability, 2), anomaly, now))

    # Update streak
    user = conn.execute('SELECT last_assessment, streak FROM users WHERE id=?', (uid,)).fetchone()
    streak = user['streak'] or 0
    last = user['last_assessment']
    today = datetime.utcnow().date()
    if last:
        last_date = datetime.fromisoformat(last).date()
        diff = (today - last_date).days
        if diff == 1:
            streak += 1
        elif diff == 0:
            pass  # same day
        else:
            streak = 1
    else:
        streak = 1
    conn.execute('UPDATE users SET streak=?, last_assessment=? WHERE id=?', (streak, now, uid))
    conn.commit()
    conn.close()

    return jsonify({'message': 'Assessment saved', 'anomaly': bool(anomaly), 'stability': round(stability, 2), 'streak': streak}), 201

@app.route('/get_history', methods=['GET'])
@login_required
def get_history():
    uid = session['user_id']
    conn = get_db()
    rows = conn.execute('''
        SELECT total_risk, password_risk, social_risk, network_risk, phishing_risk, device_risk,
               stability_index, anomaly, timestamp
        FROM assessments WHERE user_id=?
        ORDER BY timestamp ASC
        LIMIT 30
    ''', (uid,)).fetchall()
    conn.close()
    history = [dict(r) for r in rows]
    return jsonify({'history': history})

@app.route('/latest_assessment', methods=['GET'])
@login_required
def latest_assessment():
    uid = session['user_id']
    conn = get_db()
    row = conn.execute('''
        SELECT * FROM assessments WHERE user_id=?
        ORDER BY timestamp DESC LIMIT 1
    ''', (uid,)).fetchone()
    conn.close()
    if not row:
        return jsonify({'assessment': None})
    return jsonify({'assessment': dict(row)})

# ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

@app.route('/admin/stats', methods=['GET'])
def admin_stats():
    # Allow if admin session OR simple check
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    conn = get_db()
    user = conn.execute('SELECT username FROM users WHERE id=?', (session['user_id'],)).fetchone()
    if not user:
        conn.close()
        return jsonify({'error': 'Unauthorized'}), 401
    admin = conn.execute('SELECT id FROM admin_users WHERE username=?', (user['username'],)).fetchone()
    if not admin:
        conn.close()
        return jsonify({'error': 'Forbidden'}), 403

    total_users = conn.execute('SELECT COUNT(*) as c FROM users').fetchone()['c']
    total_assessments = conn.execute('SELECT COUNT(*) as c FROM assessments').fetchone()['c']

    avg_row = conn.execute('''
        SELECT AVG(total_risk) as avg_risk, AVG(password_risk) as avg_pw,
               AVG(social_risk) as avg_soc, AVG(network_risk) as avg_net,
               AVG(phishing_risk) as avg_phi, AVG(device_risk) as avg_dev
        FROM assessments
    ''').fetchone()

    dist = conn.execute('''
        SELECT
            SUM(CASE WHEN total_risk < 20 THEN 1 ELSE 0 END) as low,
            SUM(CASE WHEN total_risk >= 20 AND total_risk < 40 THEN 1 ELSE 0 END) as moderate,
            SUM(CASE WHEN total_risk >= 40 AND total_risk < 60 THEN 1 ELSE 0 END) as elevated,
            SUM(CASE WHEN total_risk >= 60 AND total_risk < 80 THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN total_risk >= 80 THEN 1 ELSE 0 END) as critical
        FROM assessments
    ''').fetchone()

    conn.close()
    return jsonify({
        'total_users': total_users,
        'total_assessments': total_assessments,
        'averages': {
            'total': round(avg_row['avg_risk'] or 0, 1),
            'password': round(avg_row['avg_pw'] or 0, 1),
            'social': round(avg_row['avg_soc'] or 0, 1),
            'network': round(avg_row['avg_net'] or 0, 1),
            'phishing': round(avg_row['avg_phi'] or 0, 1),
            'device': round(avg_row['avg_dev'] or 0, 1),
        },
        'distribution': dict(dist)
    })

# ─── STATIC FILES ────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('.', 'dfm.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)

# ─── MAIN ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
