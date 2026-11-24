import pathlib,json,hashlib,subprocess,re
r=pathlib.Path(__file__).resolve().parents[1];d=r/'docs/reconciliation/20261124';e=json.loads((d/'all-api-source-hashes.json').read_text())
expected={'artifacts/api-server/package.json','pnpm-lock.yaml','artifacts/api-server/src/lib/__tests__/notificationImage.test.mjs','artifacts/api-server/src/lib/__tests__/pushOutbox.test.mjs','artifacts/api-server/src/routes/auth.ts','artifacts/api-server/src/routes/learning.ts'}
different={n for n,h in e['hashes'].items() if not (r/n).exists() or hashlib.sha256((r/n).read_bytes()).hexdigest()!=h}
assert different==expected,(different,expected)
for n in ['artifacts/api-server/src/routes/auth.ts','artifacts/api-server/src/routes/learning.ts']:
 assert (r/n).read_bytes()==subprocess.check_output(['git','-C',str(r),'show','cdd3ab74531b01ea8ad1cd7bc8e3541b67141e9c:'+n]),n
assert not subprocess.check_output(['git','-C',str(r),'diff','--name-only','HEAD','--','artifacts/ajyal-mobile'])
for p in (r/'artifacts/api-server/src').rglob('*'):
 if p.suffix in ['.ts','.mjs']:assert not re.search(r'^<{7}|^>{7}',p.read_text(),re.M),str(p)
print('PASS: all tracked VPS API source hashes accounted; current safe redirect/status fixes retained; app untouched')
