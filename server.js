const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'www')));

const PORT = process.env.PORT || 3456;
const ROOMS_FILE = path.join(__dirname, 'rooms.json');

function loadRooms() {
  if (!fs.existsSync(ROOMS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')); }
  catch { return []; }
}

function saveRooms(rooms) {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}

// 浠庡悇绉嶆姈闊抽摼鎺ユ彁鍙栨爣璇嗙
function extractIdentifier(url) {
  const patterns = [
    /live\.douyin\.com\/(\d+)/,           // live.douyin.com/xxxxx
    /v\.douyin\.com\/([a-zA-Z0-9_-]+)/,  // v.douyin.com/xxxxx
    /www\.douyin\.com\/live\/([a-zA-Z0-9_-]+)/, // www.douyin.com/live/xxxxx
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // 绾暟瀛梤oom_id
  if (/^\d+$/.test(url.trim())) return url.trim();
  return url.trim();
}

// 閫氳繃澶氫釜娓犻亾鑾峰彇鐩存挱闂翠俊鎭?async function fetchDouyinRoomInfo(identifier) {
  const roomId = extractIdentifier(identifier);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Referer': 'https://live.douyin.com/',
    'Cookie': ''
  };

  // 鏂规硶1: 閫氳繃 api.douyin.wtf (绗笁鏂规姈闊矨PI浠ｇ悊)
  try {
    const resp = await axios.get(`https://api.douyin.wtf/api/douyin/live/${roomId}/`, {
      headers: { 'User-Agent': headers['User-Agent'] },
      timeout: 8000
    });
    if (resp.data && resp.data.data) {
      const d = resp.data.data;
      return {
        roomId: d.room_id || roomId,
        nickname: d.nickname || '鏈煡涓绘挱',
        isLive: d.is_live === true || d.is_live === 1,
        roomTitle: d.title || ''
      };
    }
  } catch (e) { /* try next method */ }

  // 鏂规硶2: 鐩存帴鎶撳彇鎶栭煶鐩存挱闂撮〉闈?  try {
    const pageResp = await axios.get(`https://live.douyin.com/${roomId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': ''
      },
      timeout: 8000,
      // 涓嶈嚜鍔ㄩ噸瀹氬悜锛屾煡鐪媓eaders
      maxRedirects: 5
    });
    // 浠庨〉闈㈠唴瀹逛腑鎻愬彇鍏抽敭淇℃伅
    const html = pageResp.data;
    const nicknameMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    const isLiveMatch = html.match(/"is_live"\s*:\s*(true|false|1|0)/);
    const titleMatch = html.match(/"title"\s*:\s*"([^"]+)"/);

    if (nicknameMatch || titleMatch) {
      return {
        roomId: roomId,
        nickname: nicknameMatch ? nicknameMatch[1] : `涓绘挱${roomId}`,
        isLive: isLiveMatch ? (isLiveMatch[1] === 'true' || isLiveMatch[1] === '1') : false,
        roomTitle: titleMatch ? titleMatch[1] : ''
      };
    }
  } catch (e) { /* try next method */ }

  // 鏂规硶3: 浣跨敤 room_id 鐩存帴鏌ヨ (澶囩敤)
  try {
    const resp3 = await axios.get(`https://api.douyin.wtf/api/room/${roomId}`, {
      headers: { 'User-Agent': headers['User-Agent'] },
      timeout: 8000
    });
    if (resp3.data && resp3.data.data) {
      const d = resp3.data.data;
      return {
        roomId: d.room_id || roomId,
        nickname: d.nickname || '鏈煡涓绘挱',
        isLive: d.is_live === true || d.is_live === 1,
        roomTitle: d.title || ''
      };
    }
  } catch (e) { /* exhausted */ }

  // 鎵€鏈夋柟娉曞け璐ワ紝杩斿洖鍩烘湰淇℃伅
  return {
    roomId: roomId,
    nickname: `涓绘挱${roomId.substring(0, 8)}`,
    isLive: false,
    roomTitle: ''
  };
}

// === API 璺敱 ===

// 鏌ヨ鍗曚釜鐩存挱闂寸姸鎬?app.post('/api/rooms/check', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: '缂哄皯鐩存挱闂存爣璇? });
  try {
    const info = await fetchDouyinRoomInfo(identifier);
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 鑾峰彇鎵€鏈夋埧闂寸姸鎬?app.get('/api/rooms/status', async (req, res) => {
  const rooms = loadRooms();
  const results = await Promise.allSettled(
    rooms.map(async (room) => {
      try {
        const info = await fetchDouyinRoomInfo(room.identifier);
        return { ...room, ...info };
      } catch {
        return { ...room, isLive: false, nickname: room.nickname || '鏈煡涓绘挱' };
      }
    })
  );
  res.json(results.map(r => r.status === 'fulfilled' ? r.value : { error: true }));
});

// 娣诲姞鎴块棿
app.post('/api/rooms', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: '缂哄皯鐩存挱闂存爣璇? });

  const rooms = loadRooms();
  if (rooms.find(r => r.identifier === identifier)) {
    return res.status(409).json({ error: '璇ョ洿鎾棿宸叉坊鍔? });
  }

  try {
    const info = await fetchDouyinRoomInfo(identifier);
    const newRoom = {
      id: Date.now().toString(),
      identifier,
      roomId: info.roomId,
      nickname: info.nickname,
      addedAt: new Date().toISOString()
    };
    rooms.push(newRoom);
    saveRooms(rooms);
    res.json(newRoom);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 鍒犻櫎鎴块棿
app.delete('/api/rooms/:id', (req, res) => {
  const { id } = req.params;
  let rooms = loadRooms();
  const before = rooms.length;
  rooms = rooms.filter(r => r.id !== id);
  if (rooms.length === before) return res.status(404).json({ error: '鎴块棿涓嶅瓨鍦? });
  saveRooms(rooms);
  res.json({ success: true });
});

// 鑾峰彇鎵€鏈夊凡淇濆瓨鎴块棿
app.get('/api/rooms', (req, res) => {
  res.json(loadRooms());
});

// 鍋ュ悍妫€鏌?app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n馃帴 鎶栭煶鐩存挱闂寸洃鎺ф湇鍔″凡鍚姩`);
  console.log(`馃摗 鐩戝惉绔彛: http://localhost:${PORT}`);
  console.log(`馃摫 鎵嬫満璁块棶: http://<鏈満IP>:${PORT}\n`);
});