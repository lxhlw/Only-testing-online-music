package dev.lxmusic.legacy;

import java.io.IOException;
import java.net.InetAddress;
import java.net.Socket;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

// Android 4.4 (API19) supports TLS1.2 but doesn't enable it by default for
// all client sockets. Preserve Android's default trust manager and hostname
// checks; never use an "accept all certificates" workaround.
public final class Tls12Factory extends SSLSocketFactory {
    private final SSLSocketFactory delegate;
    public Tls12Factory() {
        this((SSLSocketFactory) SSLSocketFactory.getDefault());
    }
    public Tls12Factory(SSLSocketFactory trustedDelegate) {
        if (trustedDelegate == null) throw new IllegalArgumentException("TLS factory missing");
        this.delegate = trustedDelegate;
    }

    private Socket enable(Socket socket) {
        if (socket instanceof SSLSocket) {
            SSLSocket ssl = (SSLSocket)socket;
            String[] supported = ssl.getSupportedProtocols();
            for (String protocol : supported) {
                if ("TLSv1.2".equals(protocol)) {
                    ssl.setEnabledProtocols(new String[]{"TLSv1.2"});
                    return socket;
                }
            }
        }
        return socket;
    }
    @Override public String[] getDefaultCipherSuites() {
        return delegate.getDefaultCipherSuites();
    }
    @Override public String[] getSupportedCipherSuites() {
        return delegate.getSupportedCipherSuites();
    }
    @Override public Socket createSocket(Socket s, String host, int port, boolean autoClose)
        throws IOException {
        return enable(delegate.createSocket(s, host, port, autoClose));
    }
    @Override public Socket createSocket(String host, int port) throws IOException {
        return enable(delegate.createSocket(host, port));
    }
    @Override public Socket createSocket(String host, int port, InetAddress local, int localPort)
        throws IOException {
        return enable(delegate.createSocket(host, port, local, localPort));
    }
    @Override public Socket createSocket(InetAddress host, int port) throws IOException {
        return enable(delegate.createSocket(host, port));
    }
    @Override public Socket createSocket(InetAddress host, int port, InetAddress local, int localPort)
        throws IOException {
        return enable(delegate.createSocket(host, port, local, localPort));
    }
}
