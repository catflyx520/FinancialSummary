"""Publish the verified demo using the runner's temporary OIDC credentials."""
import json
import os
import re
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request


def aws(*args):
    return subprocess.check_output(['aws', *args, '--output', 'json'], text=True)


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


bucket = os.environ['SITE_BUCKET']
distribution = os.environ['DISTRIBUTION_ID']
site_url = os.environ['SITE_URL'].rstrip('/')
account = json.loads(aws('sts', 'get-caller-identity'))['Account']
check(account == '397303793146', 'Unexpected AWS account')
config = json.loads(aws('cloudfront', 'get-distribution', '--id', distribution))['Distribution']
check(config['DistributionConfig']['Comment'] == 'FinancialSummary public demo', 'Wrong CloudFront distribution')
check(site_url == 'https://' + config['DomainName'], 'Site URL does not match distribution')
check(config['DistributionConfig']['Origins']['Items'][0]['DomainName'].startswith(bucket + '.s3.'), 'Bucket does not match distribution origin')
release = json.loads(Path('dist/release.json').read_text())
check(release['mode'] == 'public-demo' and release['cloudEnabled'] is False, 'Refusing to publish a personal ledger build')
check(release['commit'] == os.environ['GITHUB_SHA'], 'Artifact does not match workflow commit')
mime = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'}
files = list(Path('dist').rglob('*'))
# HTML last; keep old hashed assets so open browser sessions can finish loading.
for path in sorted((p for p in files if p.is_file()), key=lambda p: (p.suffix == '.html', str(p))):
    key = path.relative_to('dist').as_posix()
    check(not any(part.startswith('.') for part in path.parts), 'Hidden file in build')
    cache = 'public,max-age=31536000,immutable' if key.startswith('assets/') else 'no-cache,max-age=0,must-revalidate'
    subprocess.run(['aws', 's3', 'cp', str(path), f's3://{bucket}/{key}', '--content-type', mime.get(path.suffix, 'application/octet-stream'), '--cache-control', cache, '--only-show-errors'], check=True)
invalidation = json.loads(aws('cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*'))['Invalidation']['Id']
subprocess.run(['aws', 'cloudfront', 'wait', 'invalidation-completed', '--distribution-id', distribution, '--id', invalidation], check=True)
for attempt in range(12):
    try:
        with urllib.request.urlopen(site_url + '/release.json', timeout=30) as response:
            check(json.load(response)['commit'] == release['commit'], 'Release not yet visible')
        with urllib.request.urlopen(site_url + '/', timeout=30) as response:
            check(response.status == 200 and 'text/html' in response.headers.get('Content-Type', ''), 'Invalid index response')
            html = response.read().decode('utf-8')
        for asset in re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html):
            with urllib.request.urlopen(site_url + asset, timeout=30) as response:
                expected = 'javascript' if asset.endswith('.js') else 'text/css'
                check(response.status == 200 and expected in response.headers.get('Content-Type', ''), 'Wrong asset content type')
        worker = next(Path('dist/assets').glob('pdf.worker*.mjs'))
        with urllib.request.urlopen(site_url + '/assets/' + worker.name, timeout=30) as response:
            check('javascript' in response.headers.get('Content-Type', ''), 'PDF worker must use JavaScript MIME type')
        try:
            urllib.request.urlopen(site_url + '/does-not-exist-' + release['commit'], timeout=30)
            raise RuntimeError('Missing page should return 404')
        except urllib.error.HTTPError as error:
            check(error.code == 404, 'Wrong missing page status')
        break
    except (OSError, RuntimeError):
        if attempt == 11:
            raise
        time.sleep(10)
print('Published and verified:', site_url)
