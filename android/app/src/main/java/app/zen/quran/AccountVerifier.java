package app.zen.quran;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * التحقق من كلمة مرور الحساب في Java نفسها (1.29.0، H1). قبل هذا كانت الواجهة تتحقق ثم تطلب
 * grantAccountRecovery بلا دليل، فأي شيفرة تعمل في WebView (حقن، أو اعتماد خبيث) كانت تفتح باب الاستعادة.
 *
 * الآن: كلمة المرور تصل هنا، ويُطلب من Supabase Auth (عنوانه ومفتاحه العام مثبّتان في BuildConfig، لا من
 * الواجهة) منح رمز بكلمة المرور، ويُقارن معرّف المستخدم في الرد بمالك القفل المحفوظ أصلياً. الجلسة التي
 * يمنحها الخادم لا تُستعمل: تُبطَل فوراً (logout بنطاق local) ولا تُحفظ. حدّ معدّل الخادم يبقى قائماً،
 * وفوقه حدّ محلي (LockAttempts) في المستدعي.
 *
 * التحليل والتصنيف خالصان ومختبران على JVM (AccountVerifierTest)؛ الشبكة وحدها هنا خارج الاختبار.
 */
final class AccountVerifier {

    static final String OK = "OK";
    static final String BAD_CREDENTIALS = "BAD_CREDENTIALS";
    static final String RATE_LIMITED = "RATE_LIMITED";
    static final String NETWORK = "NETWORK";
    static final String SERVER = "SERVER";
    static final String CONFIG = "CONFIG";

    private static final int TIMEOUT_MS = 15_000;
    private static final Pattern UUID = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    static final class Result {
        final String code;
        final String userId;

        Result(String code, String userId) {
            this.code = code;
            this.userId = userId;
        }
    }

    private AccountVerifier() {}

    static boolean validUserId(String id) {
        return id != null && UUID.matcher(id).matches();
    }

    static boolean validEmail(String email) {
        return email != null && email.length() <= 320 && email.indexOf('@') > 0 && email.indexOf('@') == email.lastIndexOf('@')
            && !email.contains(" ") && email.indexOf('@') < email.length() - 1;
    }

    /** عنوان صالح للتحقق: https فقط، بلا مسار. */
    static boolean validBase(String base) {
        return base != null && base.startsWith("https://") && base.length() > 8 && !base.substring(8).contains("/");
    }

    /** يصنّف رد /auth/v1/token. */
    static String classify(int status, String body) {
        if (status == 200) return parseUserId(body) != null ? OK : SERVER;
        if (status == 429) return RATE_LIMITED;
        if (status == 400 || status == 401 || status == 422) {
            String b = body == null ? "" : body;
            if (b.contains("invalid_grant") || b.contains("invalid_credentials") || b.contains("Invalid login")
                || b.contains("email_not_confirmed")) return BAD_CREDENTIALS;
            return status == 422 ? BAD_CREDENTIALS : SERVER;
        }
        return SERVER;
    }

    static String parseUserId(String body) {
        if (body == null) return null;
        try {
            JSONObject o = new JSONObject(body);
            JSONObject u = o.optJSONObject("user");
            String id = u == null ? null : u.optString("id", null);
            return validUserId(id) ? id : null;
        } catch (JSONException e) {
            return null;
        }
    }

    static String parseAccessToken(String body) {
        try {
            String t = new JSONObject(body).optString("access_token", null);
            return t == null || t.isEmpty() ? null : t;
        } catch (JSONException | RuntimeException e) {
            return null;
        }
    }

    /** يُستدعى من خيط خلفي فقط. */
    static Result verify(String base, String apiKey, String email, String password) {
        if (!validBase(base) || apiKey == null || apiKey.isEmpty()) return new Result(CONFIG, null);
        if (!validEmail(email) || password == null || password.isEmpty()) return new Result(BAD_CREDENTIALS, null);
        HttpURLConnection c = null;
        try {
            JSONObject req = new JSONObject();
            req.put("email", email);
            req.put("password", password);
            c = (HttpURLConnection) new URL(base + "/auth/v1/token?grant_type=password").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setUseCaches(false);
            c.setInstanceFollowRedirects(false);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("apikey", apiKey);
            byte[] out = req.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) {
                os.write(out);
            }
            int status = c.getResponseCode();
            String body = read(status >= 400 ? c.getErrorStream() : c.getInputStream());
            String code = classify(status, body);
            if (!OK.equals(code)) return new Result(code, null);
            String userId = parseUserId(body);
            revoke(base, apiKey, parseAccessToken(body));
            return new Result(OK, userId);
        } catch (IOException e) {
            return new Result(NETWORK, null);
        } catch (Exception e) {
            return new Result(SERVER, null);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** الجلسة الممنوحة للتحقق وحده لا تبقى صالحة (أفضل جهد). */
    private static void revoke(String base, String apiKey, String accessToken) {
        if (accessToken == null) return;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + "/auth/v1/logout?scope=local").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setRequestProperty("apikey", apiKey);
            c.setRequestProperty("Authorization", "Bearer " + accessToken);
            c.setDoOutput(true);
            try (OutputStream os = c.getOutputStream()) {
                os.write(new byte[0]);
            }
            c.getResponseCode();
        } catch (Exception ignored) {
            // الجلسة تنتهي وحدها؛ لم تُحفظ في أي مكان.
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream s = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            int total = 0;
            while ((n = s.read(buf)) > 0 && total < 256 * 1024) {
                b.write(buf, 0, n);
                total += n;
            }
            return new String(b.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
