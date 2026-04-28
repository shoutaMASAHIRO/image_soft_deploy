import os
import sys
import webbrowser
import signal
from threading import Timer
from flask import Flask, render_template, request
from waitress import serve

# --- Path setup for PyInstaller ---
# When running as a bundled executable, paths need to be adjusted.
if getattr(sys, 'frozen', False):
    # Running in a bundle
    base_dir = sys._MEIPASS
    template_folder = os.path.join(base_dir, 'templates')
    static_folder = os.path.join(base_dir, 'static')
    # Point Flask to the correct folders
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    # Running as a normal script
    app = Flask(__name__)

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
    # Open the browser 1 second after the server starts
    Timer(1, open_browser).start()
    # Serve the app using waitress
    serve(app, host='127.0.0.1', port=8080)
