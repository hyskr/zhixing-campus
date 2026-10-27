"""Mirror published release assets to the project's Qiniu release bucket."""
import argparse
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--tag', required=True)
parser.add_argument('--directory', required=True, type=Path)
parser.add_argument('--qshell', default='qshell')
args = parser.parse_args()
if '/' in args.tag or not args.tag:
    raise SystemExit('Invalid release tag')
files = sorted(path for path in args.directory.iterdir() if path.is_file())
if not files:
    raise SystemExit('No release assets to mirror')
bucket = os.environ['QINIU_BUCKET']
access_key = os.environ['QINIU_ACCESS_KEY']
secret_key = os.environ['QINIU_SECRET_KEY']
qshell = str(Path(args.qshell).resolve()) if '/' in args.qshell else args.qshell
with tempfile.TemporaryDirectory(prefix='zhixing-qiniu-') as workspace:
    def run(command):
        result = subprocess.run([qshell, '--local', '--silence', *command], cwd=workspace,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise SystemExit('Qiniu operation failed: ' + command[0])
    run(['account', access_key, secret_key, 'zhixing-release', '--overwrite'])
    for file in files:
        key = f'zhixing-campus/releases/{args.tag}/{file.name}'
        command = ['rput', bucket, key, str(file.resolve()), '--overwrite']
        if file.suffix == '.json':
            command += ['--mimetype', 'application/json']
        run(command)
        print(f'Uploaded: {key}', flush=True)
print(f'Mirrored {len(files)} release assets to {bucket}')
