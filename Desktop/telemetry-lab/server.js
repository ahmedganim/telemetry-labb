const express = require('express');
const axios = require('axios');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة بيانات Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kededlspxlapggvvwgsm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlZGVkbHNweGxhcGdndnZ3Z3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTY3NjQsImV4cCI6MjEwNDAzMjc2NH0.YFqDOgD3RwUr5SWgZ8JLmaEYRTLwcmdQPOn6GF9Rdb8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// استخراج بيانات الموقع الجغرافي الصامت عبر IP
async function getGeoIP(ip) {
  try {
    const cleanIp = (ip === '::1' || ip === '127.0.0.1' || !ip) ? '' : ip;
    const response = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,message,country,city,isp,query`, {
      timeout: 4000
    });
    if (response.data && response.data.status === 'success') {
      return response.data;
    }
  } catch (err) {
    console.error('GeoIP lookup error:', err.message);
  }
  return { query: ip || 'Unknown', city: 'Unknown', country: 'Unknown', isp: 'Unknown' };
}

// 1. مسار تسجيل البصمة الصامتة للزائر
app.post('/api/visit', async (req, res) => {
  try {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '';
    const geo = await getGeoIP(rawIp);
    const { sessionId, telemetry } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const payload = {
      session_id: sessionId,
      ip_address: geo.query || rawIp,
      city: geo.city || 'Unknown',
      country: geo.country || 'Unknown',
      isp: geo.isp || 'Unknown',
      device_model: telemetry?.system?.platform || 'Unknown',
      screen_resolution: telemetry?.display?.resolution || 'Unknown',
      gpu_renderer: telemetry?.hardwareFingerprints?.gpuInfo?.renderer || 'Unknown',
      is_touch: Boolean(telemetry?.system?.isTouchDevice),
      timezone: telemetry?.localeAndTime?.timezone || 'Unknown',
      telemetry_raw: telemetry || {}
    };

    const { error } = await supabase.from('visitors').upsert(payload, { onConflict: 'session_id' });

    if (error) {
      console.error('Supabase visit error:', error.message);
    } else {
      console.log(`Visitor logged: ${sessionId} (${geo.city}, ${geo.country})`);
    }

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Visit handling error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. مسار تسجيل الطلب وحجز العطور
app.post('/api/order', async (req, res) => {
  try {
    const {
      sessionId,
      customerName,
      phoneNumber,
      province,
      area,
      cartItems,
      totalPrice,
      gps
    } = req.body;

    const mapsUrl = (gps && gps.latitude && gps.longitude)
      ? `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}`
      : null;

    const payload = {
      session_id: sessionId || 'unknown',
      customer_name: customerName || 'زبون',
      phone_number: phoneNumber || 'بدون رقم',
      province: province || 'غير محدد',
      area: area || 'غير محدد',
      cart_items: cartItems || [],
      total_price: Number(totalPrice) || 0,
      gps_latitude: gps?.latitude ? Number(gps.latitude) : null,
      gps_longitude: gps?.longitude ? Number(gps.longitude) : null,
      gps_accuracy: gps?.accuracy ? Number(gps.accuracy) : null,
      google_maps_url: mapsUrl,
      gps_status: gps?.status || 'denied'
    };

    const { data, error } = await supabase.from('orders').insert([payload]).select();

    if (error) {
      console.error('Supabase order insert error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log('Order registered successfully with ID:', data[0]?.id);
    res.json({ status: 'success', orderId: data[0]?.id });
  } catch (err) {
    console.error('Order handling catch error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Perfume Store Server is running on port ${PORT}`);
});