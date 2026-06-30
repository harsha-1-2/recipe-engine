'use client';
import { useRef, useState } from 'react';
import { API_URL } from '../config';

export default function AdminPage() {
  const [uploads, setUploads] = useState<{ recipes: File | null; catalog: File | null }>({ recipes: null, catalog: null });
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }>({ type: 'idle', msg: '' });
  const [log, setLog] = useState<string[]>([]);
  const recipesRef = useRef<HTMLInputElement>(null);
  const catalogRef = useRef<HTMLInputElement>(null);

  const appendLog = (msg: string) => setLog(p => [...p, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleUpload = async () => {
    if (!uploads.recipes && !uploads.catalog) {
      setStatus({ type: 'err', msg: 'Please select at least one file to upload.' });
      return;
    }
    setStatus({ type: 'loading', msg: 'Uploading and running ETL pipeline…' });
    setLog([]);

    try {
      if (uploads.recipes) {
        appendLog(`Uploading recipes: ${uploads.recipes.name} (${(uploads.recipes.size / 1024 / 1024).toFixed(1)} MB)…`);
        const fd = new FormData();
        fd.append('file', uploads.recipes);
        const res = await fetch(`${API_URL}/api/admin/upload/recipes`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        appendLog(`✓ Recipes ingested: ${data.count} new records added.`);
      }
      if (uploads.catalog) {
        appendLog(`Uploading grocery catalog: ${uploads.catalog.name}…`);
        const fd = new FormData();
        fd.append('file', uploads.catalog);
        const res = await fetch(`${API_URL}/api/admin/upload/catalog`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        appendLog(`✓ Catalog ingested: ${data.count} products added.`);
      }
      appendLog('Pipeline complete. Your data is live!');
      setStatus({ type: 'ok', msg: '✓ ETL pipeline completed successfully! Refresh the catalog to see your data.' });
    } catch (e: any) {
      appendLog(`✗ Error: ${e.message}`);
      setStatus({ type: 'err', msg: `Upload failed: ${e.message}` });
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '2.5rem 0' }}>
      <div className="page-header">
        <span className="section-label">Admin</span>
        <h1>Data Pipeline</h1>
        <p>Upload your recipe CSV and grocery Excel files to populate the database instantly.</p>
      </div>

      {/* Quick start tip */}
      <div style={{ background: 'var(--color-primary-pale)', border: '1px solid var(--color-primary-light)', borderRadius: 'var(--radius-md)', padding: '1rem 1.2rem', marginBottom: '1.5rem', fontSize: '0.87rem', color: 'var(--color-primary-dark)' }}>
        <strong>⚡ Quick Start with recipes_clean.csv</strong>
        <p style={{ marginTop: '0.3rem', lineHeight: 1.6 }}>
          Place your <code>recipes_clean.csv</code> in the project root, then run:<br />
          <code style={{ background: 'rgba(0,0,0,0.08)', padding: '0.15rem 0.4rem', borderRadius: 4 }}>cd apps/api && npm run seed:csv</code><br />
          This loads all 6,800+ recipes with ingredients directly into the database.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

        {/* Recipe Upload */}
        <div className="card-flat">
          <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.3rem' }}>📋 Recipe Dataset</label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.8rem' }}>
            Accepts <code>.csv</code> — e.g. <em>recipes_clean.csv</em> or <em>IndianFoodDatasetCSV.csv</em>
          </p>
          <div className={`upload-zone ${uploads.recipes ? 'has-file' : ''}`} onClick={() => recipesRef.current?.click()}>
            {uploads.recipes
              ? <><p style={{ fontSize: '1.5rem' }}>📄</p><strong style={{ color: 'var(--color-primary-dark)' }}>{uploads.recipes.name}</strong><p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{(uploads.recipes.size / 1024 / 1024).toFixed(1)} MB</p></>
              : <><p style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>⬆️</p><p style={{ fontWeight: 600 }}>Click to select CSV file</p><p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>or drag and drop here</p></>
            }
          </div>
          <input ref={recipesRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => setUploads(p => ({ ...p, recipes: e.target.files?.[0] || null }))} />
          {uploads.recipes && <button className="btn-ghost" style={{ marginTop: '0.4rem' }} onClick={() => { setUploads(p => ({ ...p, recipes: null })); if (recipesRef.current) recipesRef.current.value = ''; }}>✕ Remove</button>}
        </div>

        {/* Catalog Upload */}
        <div className="card-flat">
          <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.3rem' }}>🛒 Grocery Catalog</label>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.8rem' }}>Accepts <code>.xlsx</code> or <code>.csv</code> — e.g. <em>grocery_products.xlsx</em></p>
          <div className={`upload-zone ${uploads.catalog ? 'has-file' : ''}`} onClick={() => catalogRef.current?.click()}>
            {uploads.catalog
              ? <><p style={{ fontSize: '1.5rem' }}>📊</p><strong style={{ color: 'var(--color-primary-dark)' }}>{uploads.catalog.name}</strong><p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>{(uploads.catalog.size / 1024).toFixed(1)} KB</p></>
              : <><p style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>⬆️</p><p style={{ fontWeight: 600 }}>Click to select Excel / CSV file</p><p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>or drag and drop here</p></>
            }
          </div>
          <input ref={catalogRef} type="file" accept=".xlsx,.csv" style={{ display: 'none' }}
            onChange={e => setUploads(p => ({ ...p, catalog: e.target.files?.[0] || null }))} />
          {uploads.catalog && <button className="btn-ghost" style={{ marginTop: '0.4rem' }} onClick={() => { setUploads(p => ({ ...p, catalog: null })); if (catalogRef.current) catalogRef.current.value = ''; }}>✕ Remove</button>}
        </div>

        {status.type !== 'idle' && (
          <div className={status.type === 'ok' ? 'status-ok' : status.type === 'err' ? 'status-err' : ''} style={status.type === 'loading' ? { background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' } : {}}>
            {status.type === 'loading' ? '⏳ ' : ''}{status.msg}
          </div>
        )}

        {log.length > 0 && (
          <div className="ai-log">
            {log.map((l, i) => <div key={i} className={`l ${l.includes('✓') ? 'l-ok' : l.includes('✗') ? 'l-miss' : 'l-sys'}`}>{l}</div>)}
          </div>
        )}

        <button className="btn-primary" style={{ alignSelf: 'flex-end' }} onClick={handleUpload}
          disabled={status.type === 'loading'}>
          {status.type === 'loading' ? 'Running Pipeline…' : '🚀 Upload & Run ETL Pipeline'}
        </button>
      </div>
    </div>
  );
}
