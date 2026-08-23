import sqlite3
import os

db_path = r'c:\Gmail Ai\backend\college.db'

print("=== CHECKING LOCAL DATABASE (college.db) ===")

if not os.path.exists(db_path):
    print("Database file college.db does not exist yet.")
    print("Run the backend once (START_BACKEND.bat) to create it automatically.")
else:
    print(f"Database File: {db_path} ({os.path.getsize(db_path)} bytes)\n")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [t[0] for t in cursor.fetchall()]
    print("Tables Found:", tables)
    print("-" * 50)
    
    for table in tables:
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [c[1] for c in cursor.fetchall()]
        cursor.execute(f"SELECT * FROM {table}")
        rows = cursor.fetchall()
        
        print(f"\n--- TABLE: {table.upper()} ({len(rows)} rows) ---")
        print("Columns:", " | ".join(columns))
        print("-" * 50)
        for row in rows:
            print(row)
            
    conn.close()

