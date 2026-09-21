import os
import sqlite3
from typing import List, Tuple

# Configuration paths for database storage
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, 'instance')
DB_PATH = os.path.join(DB_DIR, 'coffee.db')

def get_db_connection() -> sqlite3.Connection:
    """
    Establish and configure a local SQLite database connection.
    Enforces foreign key constraints and column-name row mapping.
    """
    # Create instance directory if it does not exist yet
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db() -> None:
    """
    Execute DDL schema creation and populate default menu items.
    Uses context manager to guarantee automatic transaction commit.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Product catalog table with price constraint
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL CHECK (price > 0),
                description TEXT,
                image_url TEXT
            )
        ''')

        # Orders audit log with status and positive amount constraint
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                items_json TEXT NOT NULL,
                total_price REAL NOT NULL CHECK (total_price > 0),
                pickup_time TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Нове',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Populate initial catalog items if table is freshly created
        cursor.execute('SELECT COUNT(*) FROM products')
        count = cursor.fetchone()[0]

        if count == 0:
            seed_data: List[Tuple[str, str, float, str, str]] = [
                ('Еспресо', 'Кава', 45.0, 'Класичний насичений шот чорної кави з густою пінкою.', '/static/images/espresso.jpg'),
                ('Капучино', 'Кава', 65.0, 'Збалансований напій на основі еспресо та збитого молока.', '/static/images/cappuccino.jpg'),
                ('Лате', 'Кава', 70.0, 'Ніжна кава з великою кількістю шовковистого молока.', '/static/images/latte.jpg'),
                ('Флет Вайт', 'Кава', 75.0, 'Подвійний еспресо з оксамитовою текстурою молока.', '/static/images/flatwhite.jpg'),
                ('Айс Лате', 'Кава', 75.0, 'Освіжаючий холодний еспресо з молоком та кубиками льоду.', '/static/images/icelatte.jpg'),
                ('Круасан класичний', 'Десерти', 55.0, 'Свіжа випічка з листкового тіста на натуральному маслі.', '/static/images/croissant.jpg'),
                ('Чизкейк Нью-Йорк', 'Десерти', 85.0, 'Ніжний запечений сирний десерт на пісочній основі.', '/static/images/cheesecake.jpg'),
                ('Макаронс асорті', 'Десерти', 65.0, 'Набір витончених французьких тістечок з різними смаками.', '/static/images/macarons.jpg')
            ]
            cursor.executemany('''
                INSERT INTO products (name, category, price, description, image_url)
                VALUES (?, ?, ?, ?, ?)
            ''', seed_data)

        conn.commit()

if __name__ == '__main__':
    init_db()
    print("Database coffee.db initialized and verified successfully.")