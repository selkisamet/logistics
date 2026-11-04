package com.lojistik.tesellum;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.util.List;

/**
 * İrsaliye fotoğrafını CİHAZ ÜZERİNDE okur (Google ML Kit, modeller APK'ya gömülü):
 * internet yok, ücret yok, fotoğraf telefondan çıkmaz.
 *
 * Tek çağrıda iki iş: QR kod(lar)ı ve basılı metin satırları. Hangisinin irsaliye
 * numarası olduğuna burada KARAR VERİLMEZ — ham sonuç web tarafına döner
 * (lib/waybillScan.ts), aday numaralar orada çıkarılır, doğruyu depocu seçer.
 *
 * Görsel JS'te dik (EXIF dönüşü uygulanmış) JPEG'e çevrilip gelir; bu yüzden
 * döndürme açısı 0 verilir.
 */
@CapacitorPlugin(name = "DocReader")
public class DocReaderPlugin extends Plugin {

    private TextRecognizer textRecognizer;
    private BarcodeScanner barcodeScanner;

    @Override
    public void load() {
        textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        barcodeScanner = BarcodeScanning.getClient(
            new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE, Barcode.FORMAT_DATA_MATRIX)
                .build()
        );
    }

    @PluginMethod
    public void read(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Görsel gelmedi");
            return;
        }
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma >= 0) {
            data = data.substring(comma + 1);
        }

        final Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            call.reject("Görsel çözülemedi");
            return;
        }
        if (bitmap == null) {
            call.reject("Görsel çözülemedi");
            return;
        }

        InputImage image = InputImage.fromBitmap(bitmap, 0);
        final Task<Text> textTask = textRecognizer.process(image);
        final Task<List<Barcode>> codeTask = barcodeScanner.process(image);

        Tasks.whenAllComplete(textTask, codeTask).addOnCompleteListener(done -> {
            if (!textTask.isSuccessful() && !codeTask.isSuccessful()) {
                call.reject("Okuma başarısız");
                return;
            }

            JSArray codes = new JSArray();
            if (codeTask.isSuccessful() && codeTask.getResult() != null) {
                for (Barcode b : codeTask.getResult()) {
                    String raw = b.getRawValue();
                    if (raw != null && !raw.isEmpty()) codes.put(raw);
                }
            }

            JSArray lines = new JSArray();
            if (textTask.isSuccessful() && textTask.getResult() != null) {
                for (Text.TextBlock block : textTask.getResult().getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        JSObject o = new JSObject();
                        o.put("text", line.getText());
                        Rect r = line.getBoundingBox();
                        if (r != null) {
                            o.put("x", r.left);
                            o.put("y", r.top);
                            o.put("w", r.width());
                            o.put("h", r.height());
                        }
                        lines.put(o);
                    }
                }
            }

            JSObject ret = new JSObject();
            ret.put("barcodes", codes);
            ret.put("lines", lines);
            ret.put("width", bitmap.getWidth());
            ret.put("height", bitmap.getHeight());
            call.resolve(ret);
        });
    }
}
