package com.lxmusic.legacy;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/** Reject HTML, JSON and error pages before passing downloaded bytes to native codec. */
public final class AudioSignature {
    private AudioSignature() {}
    public static boolean looksLikeAudio(byte[] b) {
        if(b==null || b.length<12)return false;
        if(b[0]=='I'&&b[1]=='D'&&b[2]=='3')return true;
        if((b[0]&255)==255 && (b[1]&224)==224)return true;
        if(b[0]=='R'&&b[1]=='I'&&b[2]=='F'&&b[3]=='F'&&
           b[8]=='W'&&b[9]=='A'&&b[10]=='V'&&b[11]=='E')return true;
        if(b[0]=='O'&&b[1]=='g'&&b[2]=='g'&&b[3]=='S')return true;
        if(b[0]=='f'&&b[1]=='L'&&b[2]=='a'&&b[3]=='C')return true;
        // AAC ADTS native codecs on Android 4.4 may be available.
        return (b[0]&255)==255 && ((b[1]&246)==240);
    }
    public static boolean valid(File f) throws IOException {
        if(f==null || f.length()<1024 || f.length()>24*1024*1024)return false;
        FileInputStream in=new FileInputStream(f);
        try {
            byte[] header=new byte[12];
            if(in.read(header)!=12)return false;
            return looksLikeAudio(header);
        } finally {in.close();}
    }
}
