const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const app = express();
const PORT = Number(process.env.PORT) || 10000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

let qrText = '';
let state = 'starting';
let client = null;

function formatNumber(phone) {
    let num = String(phone || '').replace(/\D/g, '');
    if (num.startsWith('00')) num = num.slice(2);
    if (num.startsWith('0')) num = '967' + num.slice(1);
    if (!num.startsWith('967') && num.length === 9) num = '967' + num;
    return num.includes('@c.us') ? num : `${num}@c.us`;
}

function initClient() {
    state = 'starting';
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process'
            ]
        }
    });

    client.on('qr', (qr) => {
        qrText = qr;
        state = 'qr';
        console.log('[ASHISH QR] تم إنشاء رمز QR جديد');
    });

    client.on('authenticated', () => {
        console.log('[ASHISH] تم التحقق بنجاح');
    });

    client.on('ready', () => {
        state = 'ready';
        qrText = '';
        console.log('[ASHISH] جاهز للعمل - تم الربط!');
    });

    client.on('auth_failure', (msg) => {
        state = 'error';
        console.error('[ASHISH] فشل التحقق:', msg);
    });

    client.on('disconnected', () => {
        state = 'disconnected';
        qrText = '';
        client = null;
        setTimeout(initClient, 5000);
    });

    try {
        client.initialize();
    } catch (e) {
        state = 'error';
        console.error(e);
    }
}

// صفحة الويب لعرض رمز QR بدقة عالية في المتصفح
app.get('/', async (req, res) => {
    if (state === 'ready') {
        return res.send('<div style="text-align:center;margin-top:50px;font-family:sans-serif;direction:rtl;"><h2 style="color:green;">✅ متصل بالواتساب والخدمة جاهزة للعمل!</h2></div>');
    }
    if (!qrText) {
        return res.send('<div style="text-align:center;margin-top:50px;font-family:sans-serif;direction:rtl;"><h2>⏳ جاري تجهيز رمز QR...</h2><p>حدّث الصفحة بعد ثوانٍ</p></div>');
    }
    const qrImage = await QRCode.toDataURL(qrText);
    res.send(`
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:90vh;font-family:sans-serif;direction:rtl;">
            <h2>امسح رمز QR لربط الواتساب</h2>
            <img src="${qrImage}" style="width:280px;height:280px;border:2px solid #333;border-radius:10px;padding:10px;" alt="QR Code" />
            <p style="color:#666;margin-top:15px;">افتح تطبيق واتساب > الأجهزة المرتبطة > ربط جهاز</p>
        </div>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        ok: true,
        state,
        ready: state === 'ready',
        qr: !!qrText,
        label: state === 'ready' ? 'جاهز' : (state === 'qr' ? 'بانتظار مسح الرمز' : state)
    });
});

app.get('/qr', async (req, res) => {
    if (!qrText) return res.json({ ok: false, available: false });
    try {
        const qrImage = await QRCode.toDataURL(qrText);
        res.json({ ok: true, available: true, qr: qrImage });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

app.post('/restart', async (req, res) => {
    if (client) {
        try { await client.destroy(); } catch (e) {}
    }
    initClient();
    res.json({ ok: true });
});

app.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;
        if (state !== 'ready' || !client) {
            return res.status(400).json({ ok: false, error: 'واتساب غير متصل حالياً' });
        }
        if (!phone || !message) {
            return res.status(400).json({ ok: false, error: 'رقم الهاتف والرسالة مطلوبان' });
        }
        const chatId = formatNumber(phone);
        const result = await client.sendMessage(chatId, message);
        res.json({ ok: true, id: result.id._serialized });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/logout', async (req, res) => {
    try {
        if (client) {
            await client.logout();
            await client.destroy();
        }
        state = 'disconnected';
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// الربط على 0.0.0.0 ليتعرف Render على المنفذ
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ASHISH WA] http://0.0.0.0:${PORT}`);
    initClient();
});
