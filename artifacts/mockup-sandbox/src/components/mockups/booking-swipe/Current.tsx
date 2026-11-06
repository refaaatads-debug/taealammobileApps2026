import './_group.css';

const brandIcon = '/__mockup/images/ajyal-icon.png';

export function Current() {
  return (
    <main className="preview">
      <section className="request-card" dir="rtl">
        <div className="request-heading">
          <span className="avatar">م</span>
          <div>
            <strong>طلب حصة مع محمد رفعت إبراهيم</strong>
            <small>رياضيات · الأحد، ٤:٣٠ م</small>
          </div>
        </div>
        <div className="track current-track">
          <span className="side-label reject">← اسحب للرفض</span>
          <span className="side-label accept">اسحب للقبول →</span>
          <span className="handle current-handle">
            <img src={brandIcon} alt="شعار أجيال المعرفة" />
            <i /><i /><i />
          </span>
        </div>
      </section>
      <style>{`
        .preview { min-height: 190px; display:flex; align-items:center; justify-content:center; padding:18px; background:#f4f6f8; }
        .request-card { width:100%; padding:16px; border:1px solid var(--ajyal-border); border-radius:20px; background:var(--ajyal-surface); box-shadow:0 8px 24px rgba(21,28,40,.06); }
        .request-heading { display:flex; align-items:center; gap:12px; color:var(--ajyal-foreground); font-size:14px; }
        .request-heading div { display:grid; gap:5px; }
        .request-heading small { color:var(--ajyal-muted); font-size:11px; }
        .avatar { display:grid; place-items:center; width:38px; height:38px; border-radius:13px; color:var(--ajyal-primary); background:#f1f5fb; font-weight:700; }
        .track { position:relative; display:flex; align-items:center; justify-content:space-between; margin-top:15px; overflow:hidden; }
        .current-track { height:72px; padding:0 14px; border:1.5px solid var(--ajyal-border); border-radius:21px; background:var(--ajyal-soft); }
        .side-label { z-index:1; font-size:12px; font-weight:700; }
        .reject { color:#d73c43; }
        .accept { color:var(--ajyal-teal); }
        .handle { position:absolute; left:50%; transform:translateX(-50%); display:flex; justify-content:center; align-items:center; }
        .current-handle { width:54px; height:54px; border:1px solid var(--ajyal-border); border-radius:18px; background:white; box-shadow:0 3px 8px rgba(16,36,62,.16); }
        .current-handle img { width:29px; height:29px; object-fit:contain; margin-top:-5px; }
        .current-handle i { position:absolute; bottom:7px; width:4px; height:4px; border-radius:100%; background:var(--ajyal-teal); }
        .current-handle i:nth-of-type(1) { transform:translateX(-6px); }
        .current-handle i:nth-of-type(2) { background:var(--ajyal-primary); }
        .current-handle i:nth-of-type(3) { transform:translateX(6px); background:#e0ad43; }
      `}</style>
    </main>
  );
}
