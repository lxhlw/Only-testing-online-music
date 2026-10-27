package dev.lxmusic.legacy;

import android.content.Context;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.security.KeyStore;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * Modern public CA roots for Android 4.4's obsolete trust database.
 *
 * This is NOT a trust-all implementation: server certificate chains must
 * validate to either the Android platform trust store or one of the shipped
 * audited Mozilla/certifi CA roots. HttpsURLConnection retains Android's
 * strict DEFAULT hostname verifier and SNI.
 */
public final class ModernTrust {
    private ModernTrust() {}

    public static SSLSocketFactory create(Context context) throws Exception {
        final TrustManagerFactory platformFactory =
                TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        platformFactory.init((KeyStore) null);
        final X509TrustManager platform = findX509(platformFactory.getTrustManagers());

        KeyStore supplementalStore = KeyStore.getInstance(KeyStore.getDefaultType());
        supplementalStore.load(null, null);
        BufferedReader reader = new BufferedReader(
                new InputStreamReader(context.getAssets().open("modern-webpki-roots.pem"), "US-ASCII"));
        final CertificateFactory certFactory = CertificateFactory.getInstance("X.509");
        StringBuilder pem = null;
        int count = 0;
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("-----BEGIN CERTIFICATE-----")) {
                    pem = new StringBuilder();
                }
                if (pem != null) {
                    pem.append(line).append('\n');
                    if (line.startsWith("-----END CERTIFICATE-----")) {
                        X509Certificate root = (X509Certificate) certFactory.generateCertificate(
                                new ByteArrayInputStream(pem.toString().getBytes("US-ASCII")));
                        root.checkValidity();
                        if (root.getBasicConstraints() < 0) {
                            throw new CertificateException("Bundled certificate is not a CA");
                        }
                        supplementalStore.setCertificateEntry("modern-webpki-" + count, root);
                        count++;
                        pem = null;
                    }
                }
            }
        } finally { reader.close(); }
        if (count < 10) throw new CertificateException("Modern CA bundle incomplete: " + count);

        TrustManagerFactory modernFactory = TrustManagerFactory.getInstance(
                TrustManagerFactory.getDefaultAlgorithm());
        modernFactory.init(supplementalStore);
        final X509TrustManager modern = findX509(modernFactory.getTrustManagers());
        X509TrustManager combined = new X509TrustManager() {
            @Override public void checkClientTrusted(X509Certificate[] chain, String type)
                    throws CertificateException {
                platform.checkClientTrusted(chain, type);
            }
            @Override public void checkServerTrusted(X509Certificate[] chain, String type)
                    throws CertificateException {
                try {
                    platform.checkServerTrusted(chain, type);
                } catch (CertificateException oldRootNotTrusted) {
                    try {
                        modern.checkServerTrusted(chain, type);
                    } catch (CertificateException alsoUntrusted) {
                        alsoUntrusted.addSuppressed(oldRootNotTrusted);
                        throw alsoUntrusted;
                    }
                }
            }
            @Override public X509Certificate[] getAcceptedIssuers() {
                List<X509Certificate> certs = new ArrayList<X509Certificate>();
                for (X509Certificate c : platform.getAcceptedIssuers()) certs.add(c);
                for (X509Certificate c : modern.getAcceptedIssuers()) certs.add(c);
                return certs.toArray(new X509Certificate[certs.size()]);
            }
        };
        SSLContext tls = SSLContext.getInstance("TLS");
        tls.init(null, new TrustManager[]{combined}, null);
        return new Tls12Factory(tls.getSocketFactory());
    }

    private static X509TrustManager findX509(TrustManager[] managers) throws Exception {
        for (TrustManager m : managers) {
            if (m instanceof X509TrustManager) return (X509TrustManager) m;
        }
        throw new CertificateException("No X509TrustManager available");
    }
}
