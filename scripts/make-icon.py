import struct,zlib,os
n=1024
rows=[]
def rounded(x,y,l,t,r,b,radius):
    if x<l or x>r or y<t or y>b:return False
    cx=max(l+radius,min(x,r-radius));cy=max(t+radius,min(y,b-radius))
    return (x-cx)**2+(y-cy)**2<=radius**2
for y in range(n):
    row=bytearray()
    for x in range(n):
        c=(0,0,0,0)
        if rounded(x,y,48,48,976,976,205):
            f=y/n;c=(int(92-30*f),int(122-25*f),int(74-23*f),255)
        if rounded(x,y,272,196,750,822,35):c=(245,248,239,255)
        if rounded(x,y,352,342,640,371,12) or rounded(x,y,352,431,660,460,12) or rounded(x,y,352,520,590,549,12):c=(139,163,124,255)
        if rounded(x,y,350,650,377,736,10) or rounded(x,y,350,710,451,737,10):c=(70,102,59,255)
        row.extend(c)
    rows.append(b'\0'+bytes(row))
def chunk(k,data):return struct.pack('!I',len(data))+k+data+struct.pack('!I',zlib.crc32(k+data)&0xffffffff)
with open('assets/icon.png','wb') as f:f.write(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',n,n,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b''))
os.makedirs('assets/icon.iconset',exist_ok=True)
