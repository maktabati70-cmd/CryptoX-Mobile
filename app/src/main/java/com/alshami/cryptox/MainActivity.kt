package com.alshami.cryptox

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * CRYPTO X — تطبيق مستقل بالكامل: التحليل والبوت يعملان على الجوال نفسه.
 * الواجهة والمحرك (JavaScript) داخل assets/www، وهذا الملف يوفر لها:
 * طلبات الشبكة بدون قيود المتصفح، توقيع HMAC، تخزين مشفّر للمفاتيح، والإشعارات.
 * تطوير أبو عبدالله الشامي
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private val io = Executors.newFixedThreadPool(8)
    private val host = "appassets.androidplatform.net"
    private var notifId = 100

    private val secure by lazy {
        EncryptedSharedPreferences.create(
            "cx_secure", MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC), this,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#02050C"))
        setContentView(web)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            textZoom = 100
            setSupportMultipleWindows(false)
            allowFileAccess = false
        }
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.addJavascriptInterface(Bridge(), "CXN")
        web.webChromeClient = WebChromeClient()   // يفعّل نوافذ التأكيد قبل الشراء والبيع
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(req.url)

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                if (req.url.host == host) return false
                return try { startActivity(Intent(Intent.ACTION_VIEW, req.url)); true } catch (e: Exception) { true }
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { if (web.canGoBack()) web.goBack() else moveTaskToBack(true) }
        })

        createChannel()
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl("https://$host/assets/www/index.html")
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }

    override fun onDestroy() { io.shutdownNow(); super.onDestroy() }

    private fun createChannel() {
        val ch = NotificationChannel("cx", "تنبيهات CRYPTO X", NotificationManager.IMPORTANCE_HIGH)
        ch.description = "صفقات البوت والتنبيهات"
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    inner class Bridge {
        /** طلب HTTP يُنفذ في الخلفية ويعيد النتيجة إلى window.__http */
        @JavascriptInterface
        fun http(id: String, method: String, url: String, headersJson: String, body: String) {
            io.execute {
                var code = 0
                var text: String
                val hdrOut = JSONObject()
                try {
                    val c = URL(url).openConnection() as HttpURLConnection
                    c.requestMethod = method
                    c.connectTimeout = 15000
                    c.readTimeout = 25000
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) CRYPTO-X/2.0")
                    val h = JSONObject(if (headersJson.isEmpty()) "{}" else headersJson)
                    h.keys().forEach { k -> c.setRequestProperty(k, h.getString(k)) }
                    if (body.isNotEmpty() && method != "GET" && method != "DELETE") {
                        c.doOutput = true
                        c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                    }
                    code = c.responseCode
                    val stream = if (code >= 400) c.errorStream else c.inputStream
                    text = stream?.bufferedReader(Charsets.UTF_8)?.use(BufferedReader::readText) ?: ""
                    for ((k, v) in c.headerFields) if (k != null && v.isNotEmpty()) hdrOut.put(k.lowercase(), v[0])
                    c.disconnect()
                } catch (e: Exception) {
                    code = 0
                    text = e.message ?: "network error"
                }
                js("window.__http(${JSONObject.quote(id)},$code,${JSONObject.quote(text)},${JSONObject.quote(hdrOut.toString())})")
            }
        }

        @JavascriptInterface
        fun hmac(secret: String, msg: String): String {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
            return mac.doFinal(msg.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        }

        @JavascriptInterface
        fun getSecret(k: String): String = secure.getString(k, "") ?: ""

        @JavascriptInterface
        fun setSecret(k: String, v: String) {
            if (v.isEmpty()) secure.edit().remove(k).apply() else secure.edit().putString(k, v).apply()
        }

        @JavascriptInterface
        fun notify(title: String, body: String) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val pi = PendingIntent.getActivity(this@MainActivity, 0,
                Intent(this@MainActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(this@MainActivity, "cx")
                .setSmallIcon(R.drawable.ic_launcher_foreground)
                .setContentTitle(title).setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi).setAutoCancel(true).build()
            try { NotificationManagerCompat.from(this@MainActivity).notify(notifId++, n) } catch (e: SecurityException) { }
        }

        @JavascriptInterface
        fun vibrate(ms: Int) {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            v.vibrate(VibrationEffect.createOneShot(ms.toLong(), VibrationEffect.DEFAULT_AMPLITUDE))
        }

        @JavascriptInterface
        fun openUrl(url: String) = runOnUiThread {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) { }
        }
    }
}
