import os
import sys
from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError

# --- Path setup for PyInstaller ---
if getattr(sys, 'frozen', False):
    # Running in a bundle
    base_dir = sys._MEIPASS
    template_folder = os.path.join(base_dir, 'templates')
    static_folder = os.path.join(base_dir, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    # Running as a normal script
    app = Flask(__name__)

# --- Database Configuration ---
# Use DATABASE_URL from environment if available (for Render/Heroku),
# otherwise, fall back to a local SQLite database.
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Render's DATABASE_URL is for PostgreSQL, but SQLAlchemy expects postgresql://
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    local_db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'history.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{local_db_path}'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Database Models ---
class ProductFormula(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    formula = db.Column(db.String(255), nullable=False, unique=True)

class ReactantFormula(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    formula = db.Column(db.String(255), nullable=False, unique=True)

class OriginalImage(db.Model):
    # This table will only ever hold one entry
    id = db.Column(db.Integer, primary_key=True)
    image_data = db.Column(db.Text, nullable=False)

# --- API Endpoints ---
@app.route('/api/formulas', methods=['GET'])
def get_formulas():
    """Endpoint to get all unique formulas from the database."""
    try:
        products = [item.formula for item in ProductFormula.query.order_by(ProductFormula.formula).all()]
        reactants = [item.formula for item in ReactantFormula.query.order_by(ReactantFormula.formula).all()]
        return jsonify(products=products, reactants=reactants)
    except Exception as e:
        return jsonify(error=str(e)), 500

@app.route('/api/formulas', methods=['POST'])
def save_formulas():
    """Endpoint to save new formulas to the database."""
    data = request.get_json()
    if not data:
        return jsonify(status="error", message="No data provided"), 400

    product_formula = data.get('product')
    reactant_formulas = data.get('reactants', [])

    try:
        if product_formula:
            # Check if it exists before adding
            if not ProductFormula.query.filter_by(formula=product_formula).first():
                new_product = ProductFormula(formula=product_formula)
                db.session.add(new_product)
        
        if reactant_formulas:
            for r_formula in reactant_formulas:
                if r_formula and not ReactantFormula.query.filter_by(formula=r_formula).first():
                    new_reactant = ReactantFormula(formula=r_formula)
                    db.session.add(new_reactant)

        db.session.commit()
        return jsonify(status="success"), 201
    except Exception as e:
        db.session.rollback()
        return jsonify(status="error", message=str(e)), 500

@app.route('/api/image/save', methods=['POST'])
def save_image():
    """Endpoint to save the original image data (as base64)."""
    data = request.get_json()
    if not data or 'image_data' not in data:
        return jsonify(status="error", message="No image data provided"), 400
    
    image_data = data['image_data']

    try:
        # There should only ever be one image. Clear the table first.
        OriginalImage.query.delete()
        # Add the new image
        new_image = OriginalImage(id=1, image_data=image_data)
        db.session.add(new_image)
        db.session.commit()
        return jsonify(status="success"), 201
    except Exception as e:
        db.session.rollback()
        return jsonify(status="error", message=str(e)), 500

@app.route('/api/image/load', methods=['GET'])
def load_image():
    """Endpoint to load the original image data."""
    try:
        image_record = OriginalImage.query.first()
        if image_record:
            return jsonify(image_data=image_record.image_data)
        else:
            return jsonify(image_data=None), 404
    except Exception as e:
        return jsonify(error=str(e)), 500

# --- Flask Routes ---
@app.route('/')
def index():
    return render_template('index.html')

# --- Main execution ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # Create tables from models if they don't exist
    # The `debug=True` is useful for local development.
    # The host '0.0.0.0' makes the server accessible from other devices on the same network.
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
