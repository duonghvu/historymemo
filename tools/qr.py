#!/usr/bin/env python3
"""Tiny QR code generator (byte mode, error correction M, versions 1-6), no dependencies.
   python3 tools/qr.py "https://historymemo.vercel.app/..." out.svg [out.png]"""
import sys, zlib, struct

EC_M = {1: (10, [(1, 16)]), 2: (16, [(1, 28)]), 3: (26, [(1, 44)]), 4: (18, [(2, 32)]), 5: (24, [(2, 43)]), 6: (16, [(4, 27)])}
ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34]}

def gmul(x, y):
    z = 0
    for i in reversed(range(8)):
        z = (z << 1) ^ ((z >> 7) * 0x11D)
        z ^= ((y >> i) & 1) * x
    return z

def rs_divisor(n):
    r = [0] * (n - 1) + [1]; root = 1
    for _ in range(n):
        for j in range(n):
            r[j] = gmul(r[j], root)
            if j + 1 < n: r[j] ^= r[j + 1]
        root = gmul(root, 2)
    return r

def rs_rem(data, div):
    r = [0] * len(div)
    for b in data:
        f = b ^ r.pop(0); r.append(0)
        for i, c in enumerate(div): r[i] ^= gmul(c, f)
    return r

def encode(text):
    data = text.encode('utf-8')
    for ver in range(1, 7):
        ec, groups = EC_M[ver]
        cap = sum(n * d for n, d in groups)
        if 4 + 8 + 8 * len(data) <= cap * 8: break
    else:
        raise SystemExit('too long for version 6')
    bits = [0, 1, 0, 0] + [(len(data) >> i) & 1 for i in reversed(range(8))]
    for b in data: bits += [(b >> i) & 1 for i in reversed(range(8))]
    bits += [0] * min(4, cap * 8 - len(bits))
    bits += [0] * (-len(bits) % 8)
    cw = [int(''.join(map(str, bits[i:i + 8])), 2) for i in range(0, len(bits), 8)]
    pad = [0xEC, 0x11]; i = 0
    while len(cw) < cap: cw.append(pad[i % 2]); i += 1
    blocks, k = [], 0
    for n, d in groups:
        for _ in range(n): blocks.append(cw[k:k + d]); k += d
    div = rs_divisor(ec)
    ecs = [rs_rem(b, div) for b in blocks]
    out = []
    for i in range(max(len(b) for b in blocks)):
        for b in blocks:
            if i < len(b): out.append(b[i])
    for i in range(ec):
        for e in ecs: out.append(e[i])
    return ver, out

def build(text):
    ver, cw = encode(text)
    size = ver * 4 + 17
    m = [[False] * size for _ in range(size)]
    fn = [[False] * size for _ in range(size)]
    def setf(x, y, dark): m[y][x] = dark; fn[y][x] = True
    for i in range(size):
        setf(6, i, i % 2 == 0); setf(i, 6, i % 2 == 0)
    for cx, cy in [(3, 3), (size - 4, 3), (3, size - 4)]:
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                x, y = cx + dx, cy + dy
                if 0 <= x < size and 0 <= y < size:
                    d = max(abs(dx), abs(dy)); setf(x, y, d not in (2, 4))
    al = ALIGN[ver]
    for a in al:
        for b in al:
            if (a, b) in [(al[0], al[0]), (al[0], al[-1]), (al[-1], al[0])]: continue
            for dy in range(-2, 3):
                for dx in range(-2, 3): setf(a + dx, b + dy, max(abs(dx), abs(dy)) != 1)
    def format_bits(mask):
        d = (0 << 3) | mask; r = d
        for _ in range(10): r = (r << 1) ^ ((r >> 9) * 0x537)
        bits = ((d << 10) | r) ^ 0x5412
        bit = lambda i: (bits >> i) & 1 == 1
        for i in range(6): setf(8, i, bit(i))
        setf(8, 7, bit(6)); setf(8, 8, bit(7)); setf(7, 8, bit(8))
        for i in range(9, 15): setf(14 - i, 8, bit(i))
        for i in range(8): setf(size - 1 - i, 8, bit(i))
        for i in range(8, 15): setf(8, size - 15 + i, bit(i))
        setf(8, size - 8, True)
    format_bits(0)
    i, right = 0, size - 1
    while right >= 1:
        if right == 6: right = 5
        for vert in range(size):
            for j in range(2):
                x = right - j
                y = size - 1 - vert if ((right + 1) & 2) == 0 else vert
                if not fn[y][x] and i < len(cw) * 8:
                    m[y][x] = (cw[i >> 3] >> (7 - (i & 7))) & 1 == 1; i += 1
        right -= 2
    masks = [lambda x, y: (x + y) % 2 == 0, lambda x, y: y % 2 == 0, lambda x, y: x % 3 == 0,
             lambda x, y: (x + y) % 3 == 0, lambda x, y: (x // 3 + y // 2) % 2 == 0,
             lambda x, y: x * y % 2 + x * y % 3 == 0, lambda x, y: (x * y % 2 + x * y % 3) % 2 == 0,
             lambda x, y: ((x + y) % 2 + x * y % 3) % 2 == 0]
    def apply(k):
        for y in range(size):
            for x in range(size):
                if not fn[y][x] and masks[k](x, y): m[y][x] = not m[y][x]
    def penalty():
        p = 0
        for rows in (m, [list(c) for c in zip(*m)]):
            for row in rows:
                run = 1
                for a, b in zip(row, row[1:]):
                    if a == b: run += 1
                    else:
                        if run >= 5: p += run - 2
                        run = 1
                if run >= 5: p += run - 2
        for y in range(size - 1):
            for x in range(size - 1):
                if m[y][x] == m[y][x + 1] == m[y + 1][x] == m[y + 1][x + 1]: p += 3
        dark = sum(map(sum, m)); p += abs(dark * 20 - size * size * 10) // (size * size) * 10
        return p
    best = None
    for k in range(8):
        apply(k); format_bits(k); s = penalty()
        if best is None or s < best[0]: best = (s, k)
        apply(k)
    apply(best[1]); format_bits(best[1])
    return m

def svg(m, quiet=0):
    n = len(m) + 2 * quiet
    rects = ''.join(f'M{x + quiet},{y + quiet}h1v1h-1z' for y, row in enumerate(m) for x, d in enumerate(row) if d)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">'
            f'<rect width="{n}" height="{n}" fill="#fff"/><path d="{rects}" fill="#000"/></svg>')

def png(m, path, scale=10, quiet=4):
    n = (len(m) + 2 * quiet) * scale
    raw = b''
    for py in range(n):
        y = py // scale - quiet
        row = bytes(0 if 0 <= y < len(m) and 0 <= px // scale - quiet < len(m) and m[y][px // scale - quiet] else 255 for px in range(n))
        raw += b'\x00' + row
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))

if __name__ == '__main__':
    m = build(sys.argv[1])
    open(sys.argv[2], 'w').write(svg(m, quiet=1))
    if len(sys.argv) > 3: png(m, sys.argv[3])
    print(f'{len(m)}x{len(m)} modules')
