#!/usr/bin/env python3
"""Check the image without network access or real S3 credentials."""
import subprocess
import sys
import time

image = sys.argv[1]
env = {"AWS_ACCESS_KEY_ID": "local-check-key", "AWS_SECRET_ACCESS_KEY": "local-check-secret", "AWS_REGION": "us-east-1"}

def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, text=True, capture_output=True, timeout=60)

def args(values):
    return [part for key, value in values.items() for part in ("-e", key + "=" + value)]

for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
    result = docker("run", "--rm", "--network", "none", *args({**env, name: ""}), image, check=False)
    assert result.returncode != 0 and name + " is required" in result.stderr
app = docker("run", "-d", "--network", "none", *args(env), image).stdout.strip()
try:
    assert docker("inspect", "--format", "{{.Config.User}}", app).stdout.strip() == "node"
    docker("exec", app, "sh", "-c", "test ! -e /app/config.json && test ! -e /app/.env && test ! -e /app/.git")
    for _ in range(60):
        health = docker("exec", app, "curl", "-fsS", "--max-time", "2", "http://127.0.0.1:8000/health", check=False)
        if health.returncode == 0:
            break
        time.sleep(0.1)
    assert health.stdout == "OK"
    output = docker("logs", app)
    assert env["AWS_SECRET_ACCESS_KEY"] not in output.stdout + output.stderr
    assert env["AWS_ACCESS_KEY_ID"] not in output.stdout + output.stderr
    print("PASS: required credentials, private non-root startup, health without S3 calls, no secret/config files or credential logs")
finally:
    docker("rm", "-f", app, check=False)
