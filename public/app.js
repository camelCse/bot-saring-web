btnDetect.addEventListener('click', async () => {
  if (!selectedFile) return;
  
  // Pastikan elemen ada sebelum disembunyikan/ditampilkan
  const loadingDiv = document.getElementById('loading-deteksi');
  if (loadingDiv) loadingDiv.style.display = 'block';
  btnDetect.style.display = 'none';
  hasilDiv.style.display = 'none';

  const formData = new FormData();
  formData.append('image', selectedFile);
  
  try {
    const res = await fetch('/api/detect', { method: 'POST', body: formData });
    
    // Cek jika server mengembalikan error (misal: gambar terlalu besar)
    if (!res.ok) {
      const textError = await res.text();
      throw new Error(`Server Error (${res.status}). Pastikan gambar di bawah 4MB.`);
    }

    const data = await res.json();
    
    if (data.error) throw new Error(data.error);
    
    // Sembunyikan Loading, Tampilkan Hasil
    if (loadingDiv) loadingDiv.style.display = 'none';
    btnDetect.style.display = 'block';
    hasilDiv.style.display = 'block';
    
    // Update Tampilan
    document.getElementById('skor-angka').textContent = data.persen_ai + '%';
    document.getElementById('progress-fill').style.width = data.persen_ai + '%';
    
    // Pastikan penjelasan SELALU ada
    const penjelasanTeks = data.penjelasan || "Bunda, gambar ini telah dianalisis. Harap tetap waspada terhadap konten yang mencurigakan.";
    document.getElementById('penjelasan').textContent = penjelasanTeks;
    
    document.getElementById('metode').textContent = 'Metode: ' + (data.metode || 'Sistem Analisis');

  } catch (err) {
    // Jika terjadi error, KEMBALIKAN tombol dan tampilkan pesan
    if (loadingDiv) loadingDiv.style.display = 'none';
    btnDetect.style.display = 'block';
    btnDetect.disabled = false;
    btnDetect.textContent = 'Analisis Gambar';
    alert('Gagal: ' + err.message);
  }
});