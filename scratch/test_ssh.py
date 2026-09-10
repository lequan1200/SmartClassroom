import paramiko
import sys

candidates = [
    ("pi", "1234"),
    ("pi", "raspberry"),
    ("mypi5", "1234"),
    ("root", "1234"),
    ("admin", "1234"),
    ("quan", "1234"),
    ("lequan", "1234")
]

for user, pwd in candidates:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        print(f"Trying SSH with user: {user} ...")
        client.connect("10.123.122.225", port=22, username=user, password=pwd, timeout=3)
        print(f"\nSUCCESS! Connected with user='{user}' and password='{pwd}'")
        stdin, stdout, stderr = client.exec_command("pwd; uname -a; which python3; ps aux | grep -E 'python|flask|app.py'")
        print("Output:\n", stdout.read().decode())
        client.close()
        sys.exit(0)
    except Exception as e:
        print(f"Failed {user}: {e}")

print("None of the common credentials succeeded.")
