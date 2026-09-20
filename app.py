import json
import re
from functools import wraps
from http import HTTPStatus
from typing import Any, Dict, List, Tuple

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from database import get_db_connection, init_db

app = Flask(__name__)
app.secret_key = 'coffee_express_secure_local_dev_key'

# Simple authentication parameters for academic practice demo
ADMIN_CREDENTIALS: Dict[str, str] = {
    'username': 'admin',
    'password': 'coffee2026'
}

ALLOWED_STATUSES: Tuple[str, ...] = (
    'Нове',
    'Готується',
    'Готове',
    'Видано',
    'Скасовано'
)

def login_required(handler_func):
    """Decorator to enforce admin session access."""
    @wraps(handler_func)
    def wrapper(*args, **kwargs):
        if not session.get('is_admin_authenticated'):
            return jsonify({'error': 'Unauthorized access: admin session required'}), HTTPStatus.UNAUTHORIZED
        return handler_func(*args, **kwargs)
    return wrapper

# --- HTML Template Render Routes ---

@app.route('/')
def home():
    """Render customer storefront page."""
    return render_template('index.html')

@app.route('/admin')
def admin_panel():
    """Render administrative management workspace."""
    return render_template('admin.html')

# --- Authentication Endpoints ---

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    """Authenticate administrator and initialize secure session."""
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    username = str(payload.get('username', '')).strip()
    password = str(payload.get('password', '')).strip()

    if username == ADMIN_CREDENTIALS['username'] and password == ADMIN_CREDENTIALS['password']:
        session['is_admin_authenticated'] = True
        return jsonify({'message': 'Authentication successful'}), HTTPStatus.OK

    return jsonify({'error': 'Invalid administrator credentials'}), HTTPStatus.UNAUTHORIZED

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    """Clear administrator session state."""
    session.pop('is_admin_authenticated', None)
    return jsonify({'message': 'Session terminated successfully'}), HTTPStatus.OK

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    """Check current authentication status."""
    return jsonify({'is_authenticated': bool(session.get('is_admin_authenticated'))}), HTTPStatus.OK

# --- RESTful API Services ---

@app.route('/api/products', methods=['GET'])
def fetch_menu():
    """Fetch complete product catalog with category classification."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, name, category, price, description, image_url
                FROM products
                ORDER BY category DESC, id ASC
            ''')
            rows = cursor.fetchall()

        items = [dict(row) for row in rows]
        return jsonify(items), HTTPStatus.OK
    except Exception as err:
        return jsonify({'error': 'Internal server error while loading menu', 'details': str(err)}), HTTPStatus.INTERNAL_SERVER_ERROR

@app.route('/api/orders', methods=['POST'])
def submit_order():
    """Validate client payload and persist new customer order."""
    payload: Dict[str, Any] = request.get_json(silent=True)
    if not payload:
        return jsonify({'error': 'Malformed or empty JSON payload'}), HTTPStatus.BAD_REQUEST

    customer_name = str(payload.get('customer_name', '')).strip()
    customer_phone = str(payload.get('customer_phone', '')).strip()
    pickup_time = str(payload.get('pickup_time', '')).strip()
    items = payload.get('items')
    raw_total = payload.get('total_price')

    # Comprehensive validation checks
    if not customer_name or len(customer_name) < 2:
        return jsonify({'error': 'Valid customer name is required (min 2 characters)'}), HTTPStatus.BAD_REQUEST

    sanitized_phone = re.sub(r'[\s\-\(\)]', '', customer_phone)
    if not re.match(r'^\+?\d{10,13}$', sanitized_phone):
        return jsonify({'error': 'Invalid contact phone number format'}), HTTPStatus.BAD_REQUEST

    if not pickup_time:
        return jsonify({'error': 'Pickup time preference must be specified'}), HTTPStatus.BAD_REQUEST

    if not isinstance(items, list) or len(items) == 0:
        return jsonify({'error': 'Cart cannot be empty; minimum one item required'}), HTTPStatus.BAD_REQUEST

    for entry in items:
        if not isinstance(entry, dict) or not entry.get('name') or int(entry.get('quantity', 0)) <= 0:
            return jsonify({'error': 'Invalid item structure in order items list'}), HTTPStatus.BAD_REQUEST

    try:
        total_amount = round(float(raw_total), 2)
        if total_amount <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({'error': 'Total order sum must be a positive numeric value'}), HTTPStatus.BAD_REQUEST

    serialized_items = json.dumps(items, ensure_ascii=False)

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO orders (customer_name, customer_phone, items_json, total_price, pickup_time, status)
                VALUES (?, ?, ?, ?, ?, 'Нове')
            ''', (customer_name, customer_phone, serialized_items, total_amount, pickup_time))
            generated_id = cursor.lastrowid
            conn.commit()

        return jsonify({
            'message': 'Order registered successfully',
            'order_id': generated_id,
            'status': 'Нове'
        }), HTTPStatus.CREATED
    except Exception as err:
        return jsonify({'error': 'Database operation failure', 'details': str(err)}), HTTPStatus.INTERNAL_SERVER_ERROR

@app.route('/api/orders', methods=['GET'])
@login_required
def list_orders():
    """Retrieve all submitted orders for management inspection."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id, customer_name, customer_phone, items_json, total_price, pickup_time, status, created_at
                FROM orders
                ORDER BY id DESC
            ''')
            records = cursor.fetchall()

        order_list: List[Dict[str, Any]] = []
        for record in records:
            entity = dict(record)
            try:
                entity['items'] = json.loads(entity['items_json'])
            except Exception:
                entity['items'] = []
            order_list.append(entity)

        return jsonify(order_list), HTTPStatus.OK
    except Exception as err:
        return jsonify({'error': 'Failed to query orders log', 'details': str(err)}), HTTPStatus.INTERNAL_SERVER_ERROR

@app.route('/api/orders/<int:order_id>/status', methods=['PATCH'])
@login_required
def modify_order_status(order_id: int):
    """Transition state of an existing order."""
    payload: Dict[str, Any] = request.get_json(silent=True) or {}
    new_status = str(payload.get('status', '')).strip()

    if new_status not in ALLOWED_STATUSES:
        return jsonify({
            'error': f'Invalid status transition. Allowed values: {", ".join(ALLOWED_STATUSES)}'
        }), HTTPStatus.BAD_REQUEST

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE orders SET status = ? WHERE id = ?', (new_status, order_id))
            affected = cursor.rowcount
            conn.commit()

        if affected == 0:
            return jsonify({'error': f'Order with id {order_id} does not exist'}), HTTPStatus.NOT_FOUND

        return jsonify({
            'message': 'Status successfully updated',
            'order_id': order_id,
            'new_status': new_status
        }), HTTPStatus.OK
    except Exception as err:
        return jsonify({'error': 'Database update failure', 'details': str(err)}), HTTPStatus.INTERNAL_SERVER_ERROR

if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5000, debug=True)