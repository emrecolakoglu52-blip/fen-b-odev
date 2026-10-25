# 9 Fen B Sınıf Paneli: Kurulum Rehberi

Kişiye özel giriş, ödev takibi (alt görevler, yorumlar, haftalık tekrar), sınavlar (konu listesi, geri sayım), takvim, ders programı, duyurular, ders notları (beğeni), deneme sınavı takibi, çalışma sayacı, soru köşesi, anketler, sınıf bilgisi (kurallar, bağlantılar, nöbetçi sırası, doğum günleri), bildirimler ve yönetici paneli.

Bilgisayardan yap. Hepsi ücretsiz planda çalışır.

## Sadece güncelliyorsan (siteyi daha önce kurduysan)

1. Zip'teki **her şeyi** GitHub'a yükle (`api` ve `scripts` klasörleri dahil), eski dosyaların üzerine yaz.
2. **1. adımı yeniden yap**: `firestore.rules` içeriğini Firebase'de Rules sekmesine yapıştırıp **Publish** de. Yeni bölümler (soru köşesi, anket, yorum, deneme, kayıt başvurusu, sınav provası, roller…) bu kurallar yayınlanmadan çalışmaz.
3. **7. adımdaki** `.github/workflows/hatirlat.yml` dosyasını yeni içerikle değiştir (pazar özeti ve doğum günü bildirimi için yeni saatler var).
4. `package.json` ve `api/admin.js` yüklüyse **9. adım** yapılmış olmalı.
5. Mobi AI için **10. adım** (Anthropic anahtarı) gerekir. Yapmazsan Mobi düğmesi görünür ama "henüz kurulmamış" der.

## Pakette ne var

| Dosya | Ne işe yarar |
|---|---|
| `index.html`, `app.js`, `style.css` | Sitenin kendisi |
| `firebase-config.js` | Firebase ayarların (içi dolu). Bir de bildirim anahtarı gelecek (6. adım) |
| `firebase-messaging-sw.js`, `manifest.webmanifest`, `icons/` | Bildirimler ve telefona uygulama gibi eklenmesi |
| `firestore.rules` | Kimin ne yapabileceğini belirleyen güvenlik kuralları |
| `api/admin.js`, `package.json` | Yönetici işleri için Vercel sunucu fonksiyonu (hesap açma, şifre belirleme, duyuru bildirimi) |
| `scripts/` | Hatırlatmaları gönderen kod ve zamanlayıcı dosyası |

## 1. Güvenlik kurallarını yayınla

1. Firebase konsolunda **Firestore Database → Rules** sekmesine gir.
2. İçindeki her şeyi sil, `firestore.rules` dosyasının tamamını yapıştır, **Publish** de.

Bu kurallar eski siteyi kapatır. Artık sadece giriş yapmış ve yönetici tarafından eklenmiş kişiler görebilir.

## 2. E-posta/Şifre girişini aç

1. **Security → Authentication → Sign-in method** (Oturum açma yöntemi).
2. **Email/Password**'e tıkla, ilk anahtarı (Enable) aç, **Save**.
3. İstersen **Anonymous** satırını kapat, artık gerekmiyor.

## 3. Kendi yönetici hesabını oluştur (sadece bir kez)

1. **Authentication → Users → Add user**: kendi e-postanı ve bir şifre yaz, **Add user**.
2. Listede kullanıcının yanındaki **User UID** değerini kopyala (uzun harf-rakam dizisi).
3. **Firestore Database → Data → Start collection** (zaten veri varsa **+ Start collection**):
   - Collection ID: `users`
   - Document ID: kopyaladığın UID'yi yapıştır
   - Alanlar (hepsi `string`):
     - `name` = adın (örn. Emre Hoca)
     - `email` = aynı e-posta
     - `role` = `admin`
4. **Save**.

## 4. Dosyaları GitHub'a yükle

1. Zip'i bilgisayarında bir klasöre aç.
2. GitHub'da `fen-b-odev` deposuna gir, **Add file → Upload files** de.
3. Klasörün içindeki **her şeyi** sayfaya sürükle: `index.html`, `app.js`, `style.css`, `firebase-config.js`, `firebase-messaging-sw.js`, `manifest.webmanifest`, `firestore.rules`, `package.json`, `icons`, `scripts` ve `api` klasörleri. Aynı adlı eski dosyaların üzerine yazılır.
4. **Commit changes** de. Vercel bir dakika içinde siteyi kendisi günceller.

## 5. Giriş yap, kullanıcıları ve programı ekle

1. https://fen-b-odev.vercel.app adresini aç, 3. adımdaki e-posta ve şifreyle giriş yap.
2. **Yönetim → Kullanıcılar**: Ad Soyad, e-posta ve şifre yazıp **Kullanıcıyı oluştur** de. Çıkan kutudaki bilgileri kopyalayıp kişiye ver.
3. **Yönetim → Ders programı**: "Örnek saatleri koy"a bas, saatleri okulunun saatlerine göre düzelt, kutulara dokunup dersleri seç, **Programı kaydet** de.

## 6. Bildirim anahtarını (VAPID) ekle

1. Firebase'de **Project settings → Cloud Messaging** sekmesi.
2. Aşağıda **Web Push certificates** bölümünde **Generate key pair** de.
3. Çıkan **Key pair** (uzun bir metin) değerini kopyala.
4. GitHub'da `firebase-config.js` dosyasını aç, sağ üstte kalem simgesine bas. `BURAYA-VAPID-ANAHTARI` yazısını sil, kopyaladığın anahtarı yapıştır (tırnakları silme), **Commit changes** de.
5. Aynı Cloud Messaging sayfasında **Firebase Cloud Messaging API (V1)** "Enabled" görünmeli. Kapalıysa yanındaki üç noktadan **Manage API in Google Cloud Console** ile aç.

## 7. Akşam hatırlatıcısını kur

Bildirimleri sunucu yerine GitHub'ın ücretsiz zamanlayıcısı gönderir.

1. Firebase'de **Project settings → Service accounts → Generate new private key** de. Bir `.json` dosyası iner. **Bu dosyayı kimseyle paylaşma, sohbete de yapıştırma.**
2. GitHub'da `fen-b-odev` deposunda **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: indirdiğin `.json` dosyasını not defteriyle açıp **tüm içeriğini** yapıştır
   - **Add secret**
3. Depoya dön, **Add file → Create new file**. Dosya adı kutusuna aynen şunu yaz: `.github/workflows/hatirlat.yml` (eğik çizgiyi yazınca klasörler otomatik oluşur).
4. Zip'teki `scripts/hatirlat.yml` dosyasının içeriğini kopyalayıp büyük kutuya yapıştır, **Commit changes** de.
5. Üstte **Actions** sekmesine gir. Soldan **Odev hatirlaticisi**'ni seç, **Run workflow** de (slot kutusuna `h17` yazabilirsin). Yeşil tik çıkarsa kurulum tamam.

Zamanlayıcı (Türkiye saati): her gün 08:00 doğum günü bildirimi, 17:00 ve 20:00 ödev hatırlatması, pazar 19:00 haftalık özet. Hangi turun gideceği zamanlayıcıdan okunur, GitHub gecikse bile doğru bildirim gider. Elle denemek için Run workflow kutusuna `h17`, `h20`, `week` ya da `bd` yazabilirsin. GitHub bazen birkaç dakika, nadiren 15 dakika kadar geciktirebilir.

## 8. Telefonlarda bildirimi aç

Her öğrenci kendi telefonunda bir kez yapar.

**Android:** Chrome'da siteyi aç, giriş yap, **Ayarlar → Bu cihazda bildirimleri aç**, izin ver. Menüden "Ana ekrana ekle" yapılırsa uygulama gibi çalışır.

**iPhone (iOS 16.4 ve üstü):** Safari'de siteyi aç, **Paylaş → Ana Ekrana Ekle**. Sonra ana ekrandaki simgeden aç, giriş yap, **Ayarlar → Bu cihazda bildirimleri aç**, izin ver. Safari sekmesinde bildirim çalışmaz, mutlaka ana ekrandan açılmalı.

Ayarlar'da her öğrenci kendi bildirimlerini seçer: 17:00, 20:00, duyuru, sınav hatırlatması, pazar özeti, doğum günü, titreşim ve sadece belirli derslerin ödevleri.

## Bilmen gerekenler

- **Bildirim ne zaman gelir:** Sadece "yaptım" işaretlenmemiş aktif ödev varsa. Yaklaşan sınav (2 gün içinde) varsa bildirimin sonuna eklenir.
- **Şifre unutulursa:** Panelde kişinin yanındaki "Şifre sıfırlama e-postası gönder" bağlantısı kullanılır. Gerçek e-postası yoksa: **Erişimi kaldır**'a bas, Firebase'de **Authentication → Users**'tan kişiyi sil, panelden yeniden oluştur.
- **Erişimi kaldır:** Kişinin sınıf paneline erişimini keser. Firebase'deki hesabı silmez.
- **Zamanlayıcı durursa:** GitHub, depoda 60 gün hiçbir şey olmazsa zamanlayıcıyı durdurur. **Actions** sekmesinde yeniden etkinleştirebilirsin.
- **Eski anonim ödevler:** Eski siteden kalan ödevler görünür, yönetici olarak silebilirsin.
- **Herkes sadece kendi ödevini düzenler:** Yönetici hepsini düzenleyip silebilir. "Yaptım" işaretleri kişiye özeldir.

## 9. Yönetici işlevleri için Vercel anahtarı

Hesap açma, şifre belirleme, hesap silme ve duyuru bildirimi `api/admin.js` sunucu fonksiyonuyla çalışır. Bu fonksiyonun Firebase'e yönetici olarak bağlanması için:

1. Vercel'de projeyi aç: **Settings → Environment Variables**.
2. Name: `FIREBASE_SERVICE_ACCOUNT`, Value: 7. adımdaki `.json` dosyasının **tüm içeriği**. Kaydet.
3. **Deployments** sekmesinde son dağıtımın yanındaki üç noktadan **Redeploy** de.
4. Yönetim → Kullanıcılar'da **Giriş hesaplarını kontrol et**'e bas. Hata yoksa tamam.

Bu adım yapılmazsa kullanıcı oluşturma yine çalışır ama şifre belirleme, hesap silme ve duyuru bildirimi çalışmaz.

## 10. Mobi AI için anahtar (yapay zeka yardımcısı)

Mobi, her ekranın sağ altındaki "Mobi" düğmesidir. Öğrencinin ödev ve sınavlarını bilerek konu anlatır, çalışma planı yapar. Ödevi sadece çözmek yerine adım adım öğretecek şekilde ayarlıdır. Yapay zeka olarak **Groq üzerinden Llama** kullanır (Groq'un ücretsiz katmanı vardır, kullanım sınırları Groq'un sitesinde yazar).

1. https://console.groq.com adresinde hesap aç, **API Keys** bölümünden yeni bir anahtar oluştur ve kopyala.
2. Vercel > projen > **Settings > Environment Variables** bölümüne şunu ekle: `GROQ_API_KEY` = kopyaladığın anahtar.
3. İsteğe bağlı: `AI_DAILY_LIMIT` (kişi başı günlük soru sayısı, varsayılan 30) ve `AI_MODEL` (varsayılan `llama-3.3-70b-versatile`; daha hızlı ve hafif seçenek `llama-3.1-8b-instant`).
4. Vercel > **Deployments** bölümünde son dağıtımı **Redeploy** et.

Anahtarı kimseyle paylaşma, sohbete ya da GitHub'a yazma. İstersen Groq yerine Anthropic de kullanılabilir: `GROQ_API_KEY` tanımlı değilse ve `ANTHROPIC_API_KEY` tanımlıysa o kullanılır (ücretlidir).

Mobi'yi geçici kapatmak için Yönetim → Bakım → **Mobi AI açık** işaretini kaldır. Konuşmalar sunucuda saklanmaz; sadece günlük soru sayısı tutulur. Yapay zekaya öğrencinin sadece ilk adı, yapılmamış ödev ve yaklaşan sınav başlıkları gider; e-posta, telefon ve doğum günü gitmez.

Güvenlik: Öğrenci kendine zarar verme gibi ağır bir sıkıntıdan söz ederse Mobi yapay zekaya sormadan sabit, özenli bir mesaj gösterir (güvendiği bir yetişkine ve okul rehber öğretmenine söylemesini, acil durumda 112'yi aramasını önerir). Llama modelleri Türkçede ve konu doğruluğunda Claude kadar güçlü olmayabilir; öğrencilere önemli bilgileri kitaptan kontrol etmeleri panelde hatırlatılır.

## Yeni özellikler hakkında

- **Bugün ekranı:** bugünün dersleri, yaklaşan ödevler, sınav geri sayımı, haftalık özet, nöbetçi, son duyuru.
- **Alt görevler ve konu listesi:** ilerleme kişiye özeldir, kimse başkasınınkini görmez.
- **Deneme sınavları, notlar, çalışma süresi:** sadece sahibi görür, yönetici bile göremez.
- **Anketler:** "Oylar açık" seçilmezse sayılar görünür ama isimler gösterilmez. Teknik olarak kesin gizlilik sağlamaz, ciddi bir oylama için kullanma.
- **Çöp kutusu:** silinen ödev, sınav, etkinlik ve notlar 30 gün yönetici panelinde durur, geri alınabilir.
- **Takvim yükle:** dönem tatillerini tek seferde eklemek için Yönetim → Takvim yükle.
- **Yedek:** Yönetim → Bakım → Yedeği indir. Öğrenciler kendi verilerini Ayarlar → Verilerim'den indirir.
- **Soru köşesi ve anket gibi bölümlerde** ekleme izni kapatılan kişi yazamaz, sadece okur.
- **Kayıt ol (başvuru):** Giriş ekranındaki "Kayıt ol" ile öğrenci ad soyad, e-posta, şifre, doğum günü, okul numarası, telefon (isteğe bağlı) ve not yazar. Başvuru yöneticiye gider; Yönetim → **Başvurular** sekmesinden **Kabul et** ya da **Reddet** (sebep yazılabilir) denir. Kabulde öğrenci profili ve doğum günü kendiliğinden oluşur, öğrenci giriş yapabilir. Şifreyi öğrenci kendi belirler, başvuruda saklanmaz. Yöneticide giriş yapınca "yeni başvuru bekliyor" uyarısı çıkar. Kimse kayıt olmasın istersen Başvurular sekmesinde **"Yeni başvurular açık"** işaretini kaldır. Bunun için de 1. adımdaki kuralların yayınlanması gerekir.
- **Mobi AI:** Sağ alttaki düğme her ekranda açılır. Ekrana göre öneri sorular çıkar, ödev ve sınav kartlarında "Mobi'ye sor" düğmesi vardır. Günlük soru sınırı, yönetici aç/kapa anahtarı ve öğrenciye uygun güvenlik kuralları vardır. Kurulum için 10. adım.
- **Sınav provası:** Menü → Sınav provası. Mobi, seçilen konudan 5 soruluk çoktan seçmeli test hazırlar (sınav kartındaki "Prova çöz" düğmesi konuyu hazır getirir). Her soruda doğru cevap ve kısa açıklama görünür. Sonuçlar sadece öğrencide saklanır; çalışma serisi, ortalama ve zayıf konular (son 3 provası %60 altında olanlar) gösterilir. Yanlışlar tek tuşla Mobi'ye sorulabilir. Mobi AI kurulumunu (10. adım) ve güncel `firestore.rules` yayınını gerektirir; her prova günlük Mobi hakkından 1 soru sayılır.
- **Roller:** Yönetim → **Roller**. Rolün adını sen yazarsın (örn. Sınıf başkanı, Nöbet sorumlusu) ve rolün görevlerini seçersin: duyuru yazma, ders programı, sınıf bilgisi, takvim yükleme, kayıt başvurularını yönetme, başkalarının içeriğini düzenleme/silme. Rolü, kullanıcı eklerken ("Görev rolü"), kullanıcı listesinden ya da kayıt başvurusunu kabul ederken verirsin. Rolü düzenlersen ya da silersen o kişilerin yetkisi de kendiliğinden değişir. Kullanıcı yönetimi, şifreler, çöp kutusu, kayıtlar, bakım ve rollerin kendisi her zaman sadece yöneticidedir. Görevi olan kişi sadece o görevin ekranını görür. Güncel `firestore.rules` ve `api/admin.js` gerekir.


## Yeni: Mobi önerileri, fotoğraftan soru, hedef hesabı, not kartları

- **Mobi önerileri (Bugün ekranı):** "İşlenen konular" görevi olan kişi (veya yönetici) Sınıf Bilgisi ekranından her dersin bu haftaki konusunu girer. Mobi, bugünün/sonraki okul gününün derslerine ve senin zayıf konularına bakıp "Konuyu anlat" ve "Soru çöz" önerir.
- **Fotoğraftan soru çözme:** Mobi penceresindeki kamera düğmesiyle soru fotoğrafı gönderilir. Fotoğraf telefonda küçültülür. Görsel model için Vercel'de isteğe bağlı `AI_VISION_MODEL` ayarı vardır (varsayılan `qwen/qwen3.8-27b`). Model adı Groq'ta değişirse buradan güncelle.
- **Not hedefi:** Notlarım ekranında "kalan sınav sayısı" seçilir, gereken ortalama ona göre hesaplanır. Gidişat uyarısı ve "Mobi'ye sor" düğmesi eklendi.
- **Not → özet ve kartlar:** Yeterince uzun bir notta "Özet ve kartlar (Mobi)" düğmesi özet ve çevirmeli ezber kartları çıkarır.

Bu güncellemeden sonra `firestore.rules` dosyasını yeniden yayınlamayı unutma (yeni `config/topics` kuralı var).

## Yeni: Yanlış defteri, sınav planı, haftalık özet, ortak deste, Mobi taslağı

- **Yanlış defteri:** Provalarda yanlış yaptığın sorular otomatik saklanır. Mobi bunları 1, 3 ve 7 gün sonra yeniden sorar. Üç kez doğru bilirsen soru defterden çıkar. Tekrar zamanı gelince Bugün ekranında ve Sınav Provası'nda görünür.
- **Sınav hazırlık planı:** Sınav kartındaki "Hazırlık planı" düğmesi sınavdan en çok 7 gün öncesine yayılan günlük bir plan çıkarır. Zayıf konular öne alınır, son gün genel tekrardır. Görevler işaretlenir, bugünün görevi Bugün ekranına düşer. Plan Mobi'ye sormadan, uygulamanın içinde hesaplanır.
- **Haftalık özet:** Bugün ekranında "Bu haftanın özeti" kartı (ödev, çalışma süresi, prova, yaklaşan sınavlar, zayıf konular) ve "Mobi yorumlasın" düğmesi. Pazar 19:00 bildirimi eskiden olduğu gibi çalışır.
- **Ortak ezber destesi:** Not kartlarını "Sınıfla paylaş" ile herkese aç. Notlar ekranında "Ortak desteler" listesinden çalışılır. Ekleyen ya da "İçerik düzenleme" görevlisi siler.
- **Soru-cevapta Mobi taslağı:** Soruda "Mobi taslağı" düğmesi taslak cevap çıkarır, "Yanıt olarak ekle" ile "Mobi taslağı (kontrol edin)" etiketiyle yanıta eklenir.

Bu güncellemeden sonra `firestore.rules` dosyasını yeniden yayınla (yeni `wrong`, `plan` ve `decks` kuralları var).

## Yeni: Cahil AI (rehberli mod)

Hiçbir şey bilmeyen arkadaşlar için, her ekranda yardım eden ikinci bir asistan. Rol gerekmez, herkes kendisi açıp kapatır.

1. **Ayarlar > Cahil AI (rehberli mod) > "Cahil AI'yı aç"** kutusunu işaretle. Yönetici de öğrenci olduğu için kendi hesabında açabilir.
2. Açınca sol altta **Cahil AI** düğmesi görünür (Mobi sağ altta kalır). Her yeni ekranda küçük bir ipucu çıkar. Düğmeye basınca o ekranın adım adım anlatımı gelir. Ekran anlatımı yapay zeka hakkı harcamaz.
3. Serbest sorular ("ödevi nasıl eklerim?") Cahil AI'ya gider. Konu anlatma, soru çözme, fotoğraftan soru ve prova işlerini Cahil AI kendisi yapmaz, **Mobi AI'ya devreder**: prova isteyince Sınav Provası açılır ve Mobi hazırlar, konu anlatma Mobi'de açılır. Prova bitince ya da Mobi kapanınca Cahil AI kendiliğinden geri gelir, sonucu yorumlar ve "yanlışlarımı anlat", "yeni prova", "başka iş" seçeneklerini sunar.
4. Cahil AI'nın serbest soruları da günlük yapay zeka hakkından sayılır. Kutuyu kapatınca düğme ve panel kaybolur.

Asistanın adını değiştirmek için `app.js` içinde `GD_NAME`, sunucu tarafında `api/ai.js` içindeki `GUIDE_SYSTEM` metnini düzenle.
Bu güncellemeden sonra `firestore.rules` dosyasını yeniden yayınla (kullanıcının kendi `guide` tercihini yazabilmesi için), `api/ai.js` ve `api/admin.js` dosyalarını da yükleyip Vercel'de Redeploy yap.

## Yeni: Eğlence köşesi

Daha fazla > **Eğlence köşesi** altında:
- **Günün fen şakası:** Her gün farklı bir şaka. Bugün ekranında da çıkar. Şakalar uygulamanın içinde hazırdır, yapay zeka hakkı harcamaz.
- **Neden oyunu:** Saçma bir fen sorusu yaz ("Gökyüzü kırmızı olsaydı ne olurdu?"). Mobi hem güldürür hem "Gerçek cevap:" satırında doğrusunu söyler.
- **Tekerleme atölyesi:** Konuyu komik tekerleme, rap ya da maniye çevirir. Ders notlarının altındaki "Tekerleme yap" düğmesi ve Bugün ekranındaki öneriler de aynı işi yapar.
- **Ödev bahanesi jeneratörü (şaka):** Yapay zeka kullanmaz, hazır parçalardan komik bahane üretir.

Ayarlar > **Eğlence** bölümünde: Mobi'nin konuşma tarzı (Normal, Komedyen, Maç spikeri, Bilge dede; tarz sadece anlatımı değiştirir), konfeti ve günün şakası kutuları.
**Konfeti:** provadan tam puan, o an yapılması gereken bütün ödevlerin bitmesi, yedi günlük çalışma serisi ve Yanlış defterinden soru çıkması kutlanır. Hareket azaltma açık olan cihazlarda animasyon çıkmaz, yalnızca mesaj görünür.

Bu güncellemeden sonra `firestore.rules` (Mobi tarzı tercihi için), `api/ai.js` ve `app.js` dosyalarını yeniden yükle, Vercel'de Redeploy yap.

## Yeni: Bakım modu

Yönetim > **Bakım** > "Bakım modu açık". Güncelleme yaparken aç: yönetici dışındaki herkes "Bakımdayız" ekranını ve senin yazdığın mesajı görür. Giriş ekranında da kısa bir not çıkar. Kapatınca öğrencilerin ekranı kendiliğinden açılır, yenilemeleri gerekmez. Yönetici bakım sırasında uygulamayı kullanmaya devam eder ve üstte bir uyarı çubuğu görür.
Not: Bu engel uygulamanın ekranında çalışır. Amaç arkadaşları güncelleme sırasında yarım görünen ekrandan korumaktır, güvenlik kilidi değildir.
Bu güncellemeden sonra `firestore.rules` dosyasını yeniden yayınla (yeni `maint` ve `maintMsg` alanları için).

## Yeni: Takvimde plan, hocaya sorulacaklar, öneri kutusu, "Neden kaçırdım?", telefona ekle

- **Takvimde hazırlık planı:** Sınav planındaki görevler takvimde mor noktayla görünür. Güne dokununca "Hazırlık planın" altında listelenir ve oradan işaretlenir. Plan yalnızca sana özeldir.
- **Hocaya sorulacaklar:** Daha fazla > Hocaya sorulacaklar. Herkes soru ekler, "Ben de" ile oy verir, en çok oy alan üstte çıkar. "İçerik düzenleme" görevlisi ve yönetici soruyu "Soruldu" işaretler. "Listeyi kopyala" soruları derse götürmek için düz metin yapar.
- **Anonim öneri kutusu:** Ayarlar > Öneri kutusu. Gönderilen kayıtta ad ya da kullanıcı kodu tutulmaz (yalnızca metin, tür ve saat). Yalnızca yönetici okur: Yönetim > Öneriler. Okuyunca sil.
- **Neden kaçırdım?:** Notlarım'a hedefin altında bir not girince Mobi iki soru sorar: hangi konu, sebep ne. Cevap sana özel kaydedilir, sebebe göre öneri verilir ve o konu Bugün ekranında önerilir. Paneli kapatırsan hiçbir şey kaydedilmez.
- **Telefona ekle rehberi:** Uygulama ana ekrana eklenmemişse Bugün ekranında kısa bir kart çıkar (iPhone, Android ve bilgisayar için ayrı adımlar). "Bir daha gösterme" ile kapanır. Ayarlar > Telefona ekle altında rehber hep durur. iPhone'da bildirimler yalnızca ana ekrana eklenince çalışır.

Bu güncellemeden sonra `firestore.rules` dosyasını yeniden yayınla (yeni `asks`, `feedback` ve `misses` kuralları var), `app.js` ve `index.html` dosyalarını yükleyip Vercel'de Redeploy yap.
