package cn.zhixing.bjtu

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AndroidSecretStoreTest {
    @Test fun encryptedCredentialsPersistAndCanBeRemoved() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val id="test:credential-roundtrip"
        val value="测试凭据-android-roundtrip"
        val store=AndroidSecretStore(context)
        try {
            store.set(id,value)
            val persisted=context.getSharedPreferences("campus-secrets",0).getString(id,null)
            assertNotNull(persisted)
            assertFalse(persisted!!.contains(value))
            assertEquals(value,AndroidSecretStore(context).get(id))
            store.set(id,"updated-value")
            assertEquals("updated-value",AndroidSecretStore(context).get(id))
            store.delete(id)
            assertNull(AndroidSecretStore(context).get(id))
        } finally { store.delete(id) }
    }
}
