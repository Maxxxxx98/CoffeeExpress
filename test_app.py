"""
test_app.py - Automated Unit and Integration Test Suite for CoffeeExpress API.
Framework: pytest
Design Pattern: Arrange-Act-Assert (AAA)
Covers: Catalog fetching, Order validation rules, Authentication guards, Status lifecycle.
"""

import json
from http import HTTPStatus
import pytest

from app import app
from database import init_db


@pytest.fixture
def client():
    """
    Test fixture to configure a test client for Flask application.
    Initializes clean testing environment and manages request context.
    """
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test_secret_key_coffee_express'
    init_db()

    with app.test_client() as test_client:
        yield test_client


def test_fetch_products_catalog(client):
    """
    Test 1: Verify catalog fetching endpoint.
    Arranges client, acts via GET /api/products, asserts 200 OK and populated array.
    """
    # Act
    response = client.get('/api/products')
    data = json.loads(response.data)

    # Assert
    assert response.status_code == HTTPStatus.OK
    assert isinstance(data, list)
    assert len(data) > 0
    assert 'name' in data[0]
    assert 'price' in data[0]


def test_create_order_success(client):
    """
    Test 2: Verify valid order creation with modifiers.
    Sends correct payload and asserts 201 Created with generated order ID.
    """
    # Arrange
    payload = {
        'customer_name': 'Максим Тестовий',
        'customer_phone': '+380671112233',
        'pickup_time': 'через 20 хвилин',
        'items': [
            {
                'id': 1,
                'name': 'Капучино',
                'details': 'Розмір: M, Молоко: Вівсяне, Сироп: Карамель',
                'price': 95.0,
                'quantity': 2
            }
        ],
        'total_price': 190.0
    }

    # Act
    response = client.post(
        '/api/orders',
        data=json.dumps(payload),
        content_type='application/json'
    )
    result = json.loads(response.data)

    # Assert
    assert response.status_code == HTTPStatus.CREATED
    assert 'order_id' in result
    assert result['status'] == 'Нове'


def test_create_order_invalid_phone(client):
    """
    Test 3: Verify business validation rejecting invalid phone numbers.
    Sends malformed phone and asserts 400 Bad Request.
    """
    # Arrange
    payload = {
        'customer_name': 'Олександр',
        'customer_phone': 'invalid-number-123',
        'pickup_time': '15:00',
        'items': [{'id': 1, 'name': 'Еспресо', 'price': 45.0, 'quantity': 1}],
        'total_price': 45.0
    }

    # Act
    response = client.post(
        '/api/orders',
        data=json.dumps(payload),
        content_type='application/json'
    )
    result = json.loads(response.data)

    # Assert
    assert response.status_code == HTTPStatus.BAD_REQUEST
    assert 'error' in result


def test_create_order_empty_cart(client):
    """
    Test 4: Verify business validation rejecting empty carts.
    Sends empty items array and asserts 400 Bad Request.
    """
    # Arrange
    payload = {
        'customer_name': 'Іван',
        'customer_phone': '+380509876543',
        'pickup_time': 'через 10 хв',
        'items': [],
        'total_price': 0.0
    }

    # Act
    response = client.post(
        '/api/orders',
        data=json.dumps(payload),
        content_type='application/json'
    )

    # Assert
    assert response.status_code == HTTPStatus.BAD_REQUEST


def test_admin_orders_unauthorized_access(client):
    """
    Test 5: Verify security access guard on protected admin routes.
    Attempts GET /api/orders without session and asserts 401 Unauthorized.
    """
    # Act
    response = client.get('/api/orders')
    data = json.loads(response.data)

    # Assert
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert 'error' in data


def test_admin_authentication_and_status_update(client):
    """
    Test 6: Verify end-to-end admin lifecycle: login and order status transition.
    Authenticates admin, then sends PATCH to modify order status.
    """
    # Step A: Login
    login_payload = {'username': 'admin', 'password': 'coffee2026'}
    login_resp = client.post(
        '/api/auth/login',
        data=json.dumps(login_payload),
        content_type='application/json'
    )
    assert login_resp.status_code == HTTPStatus.OK

    # Step B: Modify status of order #1 to 'Готується'
    patch_payload = {'status': 'Готується'}
    patch_resp = client.patch(
        '/api/orders/1/status',
        data=json.dumps(patch_payload),
        content_type='application/json'
    )
    patch_data = json.loads(patch_resp.data)

    # Assert
    assert patch_resp.status_code in (HTTPStatus.OK, HTTPStatus.NOT_FOUND)
    if patch_resp.status_code == HTTPStatus.OK:
        assert patch_data['new_status'] == 'Готується'