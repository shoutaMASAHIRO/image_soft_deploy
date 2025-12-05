import os
import sys
import webbrowser
import signal
import sqlite3
from threading import Timer
from PIL import Image
from flask import Flask, render_template, request, jsonify
from waitress import serve

# --- Path setup for PyInstaller and Database ---
if getattr(sys, 'frozen', False):
    # Running in a bundle
    base_dir = sys._MEIPASS
    # For the database, use a writable directory
    db_dir = os.path.dirname(sys.executable)
    DATABASE_FILE = os.path.join(db_dir, 'history.db')
    template_folder = os.path.join(base_dir, 'templates')
    static_folder = os.path.join(base_dir, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    # Running as a normal script
    base_dir = os.path.dirname(os.path.abspath(__file__))
    DATABASE_FILE = os.path.join(base_dir, 'history.db')
    app = Flask(__name__)

# --- Database Setup ---
def init_db():
    """Initializes the database and creates tables if they don't exist."""
    try:
        con = sqlite3.connect(DATABASE_FILE)
        cur = con.cursor()
        # Create table for product formulas
        cur.execute('''
            CREATE TABLE IF NOT EXISTS product_formulas (
                id INTEGER PRIMARY KEY,
                formula TEXT NOT NULL UNIQUE
            )
        ''')
        # Create table for reactant formulas
        cur.execute('''
            CREATE TABLE IF NOT EXISTS reactant_formulas (
                id INTEGER PRIMARY KEY,
                formula TEXT NOT NULL UNIQUE
            )
        ''')
        con.commit()
        con.close()
        print(f"Database initialized at {DATABASE_FILE}")
    except Exception as e:
        print(f"Error initializing database: {e}")

# --- API Endpoints ---
@app.route('/api/formulas', methods=['GET'])
def get_formulas():
    """Endpoint to get all unique formulas from the database."""
    try:
        con = sqlite3.connect(DATABASE_FILE)
        con.row_factory = lambda cursor, row: row[0] # Return strings directly
        cur = con.cursor()
        
        cur.execute("SELECT formula FROM product_formulas ORDER BY formula")
        products = cur.fetchall()
        
        cur.execute("SELECT formula FROM reactant_formulas ORDER BY formula")
        reactants = cur.fetchall()
        
        con.close()
        return jsonify(products=products, reactants=reactants)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/api/formulas', methods=['POST'])
def save_formulas():
    """Endpoint to save new formulas to the database."""
    data = request.get_json()
    if not data:
        return jsonify(status="error", message="No data provided"), 400

    product = data.get('product')
    reactants = data.get('reactants', [])

    try:
        con = sqlite3.connect(DATABASE_FILE)
        cur = con.cursor()

        if product:
            cur.execute("INSERT OR IGNORE INTO product_formulas (formula) VALUES (?)", (product,))
        
        if reactants:
            # Filter out empty strings
            valid_reactants = [(r,) for r in reactants if r]
            if valid_reactants:
                cur.executemany("INSERT OR IGNORE INTO reactant_formulas (formula) VALUES (?)", valid_reactants)

        con.commit()
        con.close()
        return jsonify(status="success"), 201
    except Exception as e:
        return jsonify(status="error", message=str(e)), 500

# --- Flask Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/shutdown', methods=['POST'])
def shutdown():
    """Endpoint to shut down the server."""
    try:
        pid = os.getpid()
        os.kill(pid, signal.SIGTERM)
        return 'Server shutting down...'
    except Exception as e:
        return f'Error shutting down: {e}', 500

def open_browser():
    """
    Opens the default web browser to the application's URL.
    """
    webbrowser.open_new("http://127.0.0.1:8080")

if __name__ == '__main__':
    init_db() # Initialize the database on startup
    # Open the browser 1 second after the server starts
    Timer(1, open_browser).start()
    # Serve the app using waitress
    serve(app, host='127.0.0.1', port=8080)
