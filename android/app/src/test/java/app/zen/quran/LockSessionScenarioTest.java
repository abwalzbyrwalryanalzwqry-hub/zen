package app.zen.quran;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * يشغّل السيناريوهات المشتركة (app-lock-scenarios.json) على LockSession.java. الملف نفسه يشغّله
 * src/lib/app-lock-session.test.ts على نسخة الواجهة التي يعتمدها الجسر الوهمي في e2e، فأي انحراف بين
 * Java والمحاكاة يفشل في أحد الطرفين.
 */
public class LockSessionScenarioTest {

    @Test
    public void allSharedScenariosPass() throws Exception {
        JSONArray scenarios = load().getJSONArray("scenarios");
        assertTrue("لا سيناريوهات", scenarios.length() >= 15);
        for (int i = 0; i < scenarios.length(); i++) {
            JSONObject sc = scenarios.getJSONObject(i);
            run(sc.getString("name"), sc.getJSONArray("steps"));
        }
    }

    private static void run(String name, JSONArray steps) throws Exception {
        LockSession s = new LockSession();
        for (int i = 0; i < steps.length(); i++) {
            JSONObject st = steps.getJSONObject(i);
            long t = st.getLong("t");
            boolean enabled = st.optBoolean("enabled", true);
            String op = st.getString("op");
            Boolean result = null;
            switch (op) {
                case "unlock":
                    s.unlock(t);
                    break;
                case "relock":
                    result = s.relock();
                    break;
                case "stop":
                    result = s.onStop(t, enabled, st.getLong("grace"));
                    break;
                case "start":
                    result = s.onStart(t, enabled, st.getLong("grace"));
                    break;
                case "beginAuth":
                    result = s.beginAuth(t);
                    break;
                case "endAuth":
                    s.endAuth(t, st.getBoolean("success"));
                    break;
                case "reset":
                    s.reset();
                    break;
                case "lockNow":
                    result = s.lockNow(enabled);
                    break;
                case "screenOff":
                    result = s.onScreenOff(t, enabled, st.getBoolean("lockOnScreenOff"));
                    break;
                case "touch":
                    s.touch(t);
                    break;
                case "idle":
                    result = s.onIdleTick(t, enabled, st.getLong("idleMs"));
                    break;
                case "authorize":
                    s.authorize(t, st.getLong("window"), st.getBoolean("requireUnlocked"));
                    break;
                case "setProof":
                    s.setProof(st.getString("mode"), t, st.getLong("window"));
                    break;
                case "consumeProof":
                    result = s.consumeProof(st.getString("mode"), t);
                    break;
                default:
                    throw new AssertionError(name + ": عملية مجهولة " + op);
            }
            JSONObject ex = st.optJSONObject("expect");
            if (ex == null) continue;
            String at = name + " — الخطوة " + (i + 1) + " (" + op + ")";
            if (ex.has("result")) assertEquals(at + ": result", (Object) ex.getBoolean("result"), result);
            if (ex.has("unlocked")) assertEquals(at + ": unlocked", (Object) ex.getBoolean("unlocked"), (Object) s.unlocked);
            if (ex.has("authorized")) assertEquals(at + ": authorized", (Object) ex.getBoolean("authorized"), (Object) s.authorized(t));
        }
    }

    private static JSONObject load() throws Exception {
        try (InputStream in = LockSessionScenarioTest.class.getClassLoader().getResourceAsStream("app-lock-scenarios.json")) {
            if (in == null) throw new AssertionError("app-lock-scenarios.json غير موجود");
            return new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }
}
