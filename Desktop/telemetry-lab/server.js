const express = require('express');
const path = require('path');
const http = require('http');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// دالة لجلب بيانات الموقع الجغرافي والشبكة صامتاً بناءً على عنوان الـ IP
function resolvePassiveGeoIP(ip) {
    return new Promise((resolve) => {
        // معالجة عناوين الشبكة المحلية أثناء التجربة على Localhost
        if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return resolve({
                ipType: "Localhost / Private Network",
                country: "Local Testing Environment",
                region: "Local",
                city: "Localhost",
                isp: "Internal Network Interface",
                coordinates: { lat: 0, lon: 0 },
                mapsLink: "N/A"
            });
        }

        const endpoint = `http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;

        http.get(endpoint, (res) => {
            let buffer = '';
            res.on('data', chunk => buffer += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(buffer);
                    if (parsed.status === 'success') {
                        resolve({
                            ipType: "Public WAN IP",
                            country: parsed.country,
                            region: parsed.regionName,
                            city: parsed.city,
                            zipCode: parsed.zip || "غير متوفر",
                            isp: parsed.isp,
                            organization: parsed.org,
                            asNumber: parsed.as,
                            approxCoordinates: {
                                latitude: parsed.lat,
                                longitude: parsed.lon
                            },
                            approxMapsLink: `https://www.google.com/maps?q=${parsed.lat},${parsed.lon}`
                        });
                    } else {
                        resolve({ error: "تعذر الاستعلام عن الـ IP", detail: parsed.message });
                    }
                } catch (e) {
                    resolve({ error: "خطأ في تحليل استجابة مزود الـ GeoIP" });
                }
            });
        }).on('error', (err) => {
            resolve({ error: "فشل الاتصال بخدمة الاستعلام الجغرافي: " + err.message });
        });
    });
}

app.post('/api/telemetry', async (req, res) => {
    // 1. استخراج الـ IP الحقيقي حتى لو كان الخادم خلف Proxy أو Cloudflare
    let clientIp = req.headers['x-forwarded-for'] 
        ? req.headers['x-forwarded-for'].split(',')[0].trim() 
        : req.socket.remoteAddress;

    // تنظيف بادئة IPv6 الشائعة في Node.js
    if (clientIp && clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
    }

    // 2. سحب الموقع الجغرافي الصامت للشبكة
    const geoData = await resolvePassiveGeoIP(clientIp);

    const serverReport = {
        ipAddress: clientIp,
        geoTelemetry: geoData,
        userAgent: req.headers['user-agent'],
        acceptLanguage: req.headers['accept-language'],
        referer: req.headers['referer'] || 'مباشر (Direct Access)',
        connectionType: req.headers['connection'] || 'Unknown',
        receivedAt: new Date().toISOString()
    };

    // 3. دمج بيانات الخادم والموقع الجغرافي مع تقرير المتصفح
    const clientReport = req.body;

    const fullTelemetryLog = {
        networkAndLocationLayer: serverReport,
        hardwareAndBrowserLayer: clientReport
    };

    console.log("\n================ [INTEGRATED TELEMETRY & GEOIP AUDIT] ================");
    console.log(JSON.stringify(fullTelemetryLog, null, 2));
    console.log("=======================================================================\n");

    res.json({
        status: 'success',
        message: 'تم استلام وتوثيق السجل الجغرافي والبصمة بنجاح',
        networkSummary: {
            ip: clientIp,
            location: `${geoData.city || ''}, ${geoData.country || ''}`,
            isp: geoData.isp || 'Unknown',
            mapsLink: geoData.approxMapsLink || 'N/A'
        },
        timestamp: serverReport.receivedAt
    });
});

app.listen(PORT, () => {
    console.log(`[+] السيرفر يعمل الآن بنجاح على المنفذ: ${PORT}`);
});