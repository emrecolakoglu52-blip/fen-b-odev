# 9 Fen B Ödev Takip: Kurulum Rehberi

Bu pakette şunlar var:

- `index.html`: sayfanın kendisi
- `firebase-config.js`: Firebase ayarlarını yapıştıracağın dosya
- `firestore.rules`: kimin ne yapabileceğini belirleyen güvenlik kuralları

Toplam süre yaklaşık 15-20 dakika. Hepsi ücretsiz planda çalışır. Bilgisayardan yapman çok daha kolay olur.

## 1. Firebase projesi oluştur

1. https://console.firebase.google.com adresine Google hesabınla gir.
2. **Proje oluştur** (Create a project) de, adını yaz (örn. `9fenb-odev`).
3. Google Analytics sorusunda **kapat**, projeyi oluştur.

## 2. Gizli kimlik girişini aç

Öğrencilerin hesap açmasına gerek kalmasın diye her tarayıcıya otomatik gizli bir kimlik verilir. Bu sayede herkes kendi eklediği ödevi düzenleyip silebilir.

1. Sol menüde **Build → Authentication** seçeneğine gir, **Get started** de.
2. **Sign-in method** sekmesinde **Anonymous** satırını aç, **Enable** yapıp kaydet.

## 3. Veritabanını aç ve kuralları yükle

1. Sol menüde **Build → Firestore Database → Create database** seç.
2. Konum olarak `eur3 (Europe)` ya da sana yakın bir Avrupa konumu seç.
3. **Production mode** seç ve bitir.
4. Açılan sayfada **Rules** sekmesine geç.
5. İçindeki her şeyi sil, bu paketteki `firestore.rules` dosyasının içeriğini yapıştır ve **Publish** de.

## 4. Web uygulamasını kaydet ve ayarları yapıştır

1. Sol üstte dişli simgesi → **Project settings**.
2. Aşağıdaki **Your apps** bölümünde `</>` (Web) simgesine bas.
3. Uygulamaya bir ad ver (örn. `odev-takip`). "Firebase Hosting" kutusunu **işaretleme**. **Register app** de.
4. Ekranda `firebaseConfig` adlı bir blok çıkar (apiKey, authDomain, projectId vb.).
5. `firebase-config.js` dosyasını aç, `BURAYA-...` yazan yerlere bu değerleri aynen yapıştır ve kaydet.

## 5. Siteyi yayınla (Vercel)

1. https://github.com adresinde hesabın yoksa ücretsiz aç. **New repository** ile yeni bir depo oluştur (örn. `9fenb-odev`).
2. Depoya **Add file → Upload files** ile `index.html`, `firebase-config.js` ve `firestore.rules` dosyalarını yükle ve **Commit** de. (`README.md` yüklemen şart değil.)
3. https://vercel.com adresine GitHub hesabınla gir.
4. **Add New → Project** seç, `9fenb-odev` deposunu **Import** et.
5. Hiçbir ayarı değiştirmeden **Deploy** de. Bir dakika içinde `https://9fenb-odev.vercel.app` gibi bir bağlantı verir.
6. Bu bağlantıyı sınıf grubuna at.

## 6. Hata alırsan

- **"Firebase ayarı henüz girilmemiş"**: `firebase-config.js` içindeki `BURAYA-...` değerleri değişmemiş.
- **"Bağlanılamadı"**: 2. adımda Anonymous girişin açık olduğunu kontrol et. Hâlâ olmuyorsa Firebase'de Authentication → Settings → **Authorized domains** bölümüne Vercel'in verdiği adresi (örn. `9fenb-odev.vercel.app`) ekle.
- **"Okuma izni yok"**: 3. adımdaki kuralları yayınlamayı unutmuşsun.
- **"Bu işlem için yetkin yok"**: Başkasının eklediği ödevi değiştirmeye çalışıyorsun. Bu normal.

## Bilmen gerekenler

- Herkes ödev ekleyebilir ve bağlantıyı bilen herkes ödevleri görebilir. Bağlantıyı sınıf dışına atma.
- Bir kişi sadece kendi eklediği ödevi düzenleyip silebilir. Tarayıcı verisi silinirse (veya başka telefondan girilirse) o kişi eski ödevlerini artık değiştiremez.
- Uygunsuz ya da yanlış bir ödevi sen silmek istersen Firebase konsolunda **Firestore Database → Data → homework** kısmından silebilirsin.
- Ücretsiz plan bu kullanım için fazlasıyla yeter. Fotoğraflar küçültülerek ödev kaydının içinde saklanır.
- Görünüm ayarları (tema, yazı boyutu, renk) her kişinin kendi tarayıcısında kalır.
