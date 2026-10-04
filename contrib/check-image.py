#!/usr/bin/env python3
"""Check the image without network access or real S3 credentials."""
import subprocess
import sys
import time

image = sys.argv[1]
env = {"AWS_REGION": "us-east-1", "AWS_EC2_METADATA_DISABLED": "true"}

def docker(*args, check=True):
    return subprocess.run(["docker", *args], check=check, text=True, capture_output=True, timeout=60)

def args(values):
    return [part for key, value in values.items() for part in ("-e", key + "=" + value)]

result = docker("run", "--rm", "--network", "none", *args({**env, "PORT": "invalid"}), image, check=False)
assert result.returncode != 0 and "PORT must be an integer" in result.stderr
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
    runtime_env = docker("inspect", "--format", "{{json .Config.Env}}", app).stdout
    for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"):
        assert name + "=" not in runtime_env
    print("PASS: startup without static keys, port validation, non-root health without S3, no secret/config files")
finally:
    docker("rm", "-f", app, check=False)
