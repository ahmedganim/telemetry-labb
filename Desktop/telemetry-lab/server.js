const express = require('express');
const axios = require('axios');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة بيانات Supabase
const SUPABASE_URL = 'https://kededlspxlapggvvwgsm.supabase.co';
const SUPABASE_KEY = 'sb_secret_Fyr5d1j11qXXTVZeFoU9NA_mKuPGaOT';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// دالة سحب الموقع الجغرافي الصامت للشبكة
async function getGeoIP(ip) {
  try {
    const cleanIp = ip === '::1' || ip === '127.0.0.1' ? '' : ip;
    const response = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,message,country,city,isp,query`, { timeout: 4000 });
    if (response.data && response.data.status === 'success') {
      return response.data;
    }
  } catch (err) {
    console.error('GeoIP lookup error:', err.message);
  }
  return { query: ip, city: 'Unknown', country: 'Unknown', isp: 'Unknown' };
}

// 1. مسار تسجيل البصمة الصامتة فور فتح المتجر
app.post('/api/visit', async (req, res) => {
  try {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '';
    const geo = await getGeoIP(rawIp);
    const { sessionId, telemetry } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    const { error } = await supabase.from('visitors').upsert({
      session_id: sessionId,
      ip_address: geo.query || rawIp,
      city: geo.city,
      country: geo.country,
      isp: geo.isp,
      device_model: telemetry?.system?.platform || 'Unknown',
      screen_resolution: telemetry?.display?.resolution || 'Unknown',
      gpu_renderer: telemetry?.hardwareFingerprints?.gpuInfo?.renderer || 'Unknown',
      is_touch: telemetry?.system?.isTouchDevice || false,
      timezone: telemetry?.localeAndTime?.timezone || 'Unknown',
      telemetry_raw: telemetry || {}
    }, { onConflict: 'session_id' });

    if (error) console.error('Supabase visitor insert error:', error.message);
    res.json({ status: 'success' });
  } catch (err) {
    console.error('Visit handling error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. مسار تسجيل الطلب وحجز العطور وموقع الـ GPS
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

    const mapsUrl = (gps?.latitude && gps?.longitude) 
      ? `https://www.google.com/maps?q=${gps.latitude},${gps.longitude}` 
      : null;

    const { data, error } = await supabase.from('orders').insert({
      session_id: sessionId,
      customer_name: customerName,
      phone_number: phoneNumber,
      province: province,
      area: area,
      cart_items: cartItems,
      total_price: totalPrice,
      gps_latitude: gps?.latitude || null,
      gps_longitude: gps?.longitude || null,
      gps_accuracy: gps?.accuracy || null,
      google_maps_url: mapsUrl,
      gps_status: gps?.status || 'denied'
    }).select();

    if (error) {
      console.error('Supabase order insert error:', error.message);
      return res.status(500).json({ error: 'Database insert failed' });
    }

    res.json({ status: 'success', orderId: data[0]?.id });
  } catch (err) {
    console.error('Order handling error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Perfume Store Server running on port ${PORT}`);
});