"""Haal alleen de animatie uit een Meshy-GLB (mesh, skin en texturen eruit): python anim_only.py in.glb uit.glb
Alle Meshy-rigs hebben dezelfde botnamen, dus zo'n dansclip past op elk gegenereerd figuur."""
import json, struct, sys

src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n])
off = 20 + n
binlen = struct.unpack('<I', b[off:off + 4])[0]
bin_ = b[off + 8:off + 8 + binlen]

out, views, accs, remap = bytearray(), [], [], {}
def take(ai):
    if ai in remap: return remap[ai]
    a = dict(j['accessors'][ai]); bv = j['bufferViews'][a['bufferView']]
    o = bv.get('byteOffset', 0); data = bin_[o:o + bv['byteLength']]
    while len(out) % 4: out.append(0)
    views.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}); out.extend(data)
    a['bufferView'] = len(views) - 1; accs.append(a); remap[ai] = len(accs) - 1
    return remap[ai]

anims = []
for an in j.get('animations', []):
    smp = [{**s, 'input': take(s['input']), 'output': take(s['output'])} for s in an['samplers']]
    anims.append({'name': an.get('name', ''), 'samplers': smp, 'channels': an['channels']})
nodes = [{k: v for k, v in nd.items() if k not in ('mesh', 'skin')} for nd in j['nodes']]
g = {'asset': j['asset'], 'scene': 0, 'scenes': j['scenes'], 'nodes': nodes, 'animations': anims,
     'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(out)}]}
js = json.dumps(g, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
while len(out) % 4: out.append(0)
total = 12 + 8 + len(js) + 8 + len(out)
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(out), b'BIN\0')); f.write(out)
print(dst, total, [a['name'] for a in anims])
