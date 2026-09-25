import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, money } from './api';
const Context = createContext();
export const useStore = () => useContext(Context);
export const categoryLabel = name => ({ Male: 'Men', Female: 'Women', Kids: 'Kids' }[name] || name);
export function Icon({ name, size = 20, ...props }) {
  const paths = { bag: <><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>, heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>, user: <><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></>, arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>, menu: <path d="M3 6h18M3 12h18M3 18h18"/>, check: <path d="m5 12 4 4L19 6"/>, truck: <><path d="M1 4h13v13H1zM14 9h4l4 5v3h-8"/><circle cx="5" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>, shield: <><path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6l-9-4Z"/><path d="m8 11 3 3 5-5"/></>, trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></> };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.arrow}</svg>;
}
export function Photo({ src, alt, ...props }) { return <img src={(Array.isArray(src) ? src[0] : src) || '/image-placeholder.svg'} alt={alt || ''} onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/image-placeholder.svg'; }} {...props} />; }
export function Empty({ title, text, link = '/shop', action = 'Explore the collection' }) { return <div className="empty"><Icon name="bag" size={42}/><h2>{title}</h2><p>{text}</p><Link className="btn" to={link}>{action}<Icon name="arrow"/></Link></div>; }
export function Loading() { return <div className="loading" role="status"><span className="spinner"/>Loading your edit…</div>; }
export function useLoad(path) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [version, setVersion] = useState(0);
  useEffect(() => { let active = true; setLoading(true); setError(''); api(path).then(x => { if (active) setData(x); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [path, version]);
  return { data, error, loading, reload: () => setVersion(v => v + 1) };
}
export function ErrorBox({ error, retry }) { return error ? <div className="error" role="alert">{error}{retry && <button className="text-button" onClick={retry}>Try again</button>}</div> : null; }
export function Provider({ children }) {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false), [cart, setCart] = useState({ items: [], subtotal: 0, total: 0, shipping: 0 }), [wishlist, setWishlist] = useState([]), [toast, setToast] = useState('');
  const [catalog, setCatalog] = useState({ maincategory: [], subcategory: [], brand: [], testimonial: [] }), [config, setConfig] = useState({ name: 'APNA BAZAR', freeShipping: 1999, shipping: 99 });
  const [connectionError, setConnectionError] = useState('');
  const notify = useCallback(message => setToast(message), []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); } }, [toast]);
  const refresh = useCallback(async () => { const [c, w] = await Promise.all([api('/cart'), api('/wishlist')]); setCart(c); setWishlist(w); }, []);
  useEffect(() => { Promise.all([api('/auth/me'), api('/catalog'), api('/config')]).then(([u, c, s]) => { setUser(u); setCatalog(c); setConfig(s); if (u) return refresh(); }).catch(e => setConnectionError(e.message)).finally(() => setReady(true)); }, [refresh]);
  return <Context.Provider value={{ user, setUser, ready, cart, setCart, wishlist, setWishlist, catalog, setCatalog, config, notify, refresh }}>{connectionError && <div className="connection-error" role="alert">We couldn't reach the store. {connectionError} <button onClick={() => window.location.reload()}>Reconnect</button></div>}{ready ? children : <Loading/>}{toast && <div className="toast" role="status"><Icon name="check"/>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><Icon name="close" size={16}/></button></div>}</Context.Provider>;
}
export function Protected({ children }) { const { user, ready } = useStore(), location = useLocation(); if (!ready) return <Loading/>; return user ? children : <Navigate to="/login" state={{ from: location.pathname + location.search }} replace/>; }
export function ProductCard({ product: p }) {
  const { wishlist, user, refresh, notify } = useStore(), navigate = useNavigate(), [busy, setBusy] = useState(false), saved = wishlist.some(w => w.id === p.id);
  return <article className="product-card"><div className="product-image"><Link to={`/product/${p.id}`}><Photo src={p.pic} alt={p.name} loading="lazy"/></Link>{p.discount > 0 && <span className="product-tag">{p.discount}% OFF</span>}<button className={`save-button ${saved ? 'saved' : ''}`} disabled={busy} aria-label={`${saved ? 'Remove' : 'Save'} ${p.name}${saved ? ' from wishlist' : ' to wishlist'}`} onClick={async () => { if (!user) return navigate('/login', { state: { from: '/wishlist' } }); setBusy(true); try { await api(`/wishlist/${p.id}`, { method: saved ? 'DELETE' : 'POST' }); await refresh(); notify(saved ? 'Removed from your wishlist' : 'Saved to your wishlist'); } catch (e) { notify(e.message); } finally { setBusy(false); } }}><Icon name="heart" size={18}/></button><Link className="quick-shop" to={`/product/${p.id}`}>{p.stockQuantity > 0 ? 'Discover this piece' : 'View · Out of stock'}<Icon name="arrow" size={16}/></Link></div><div className="product-meta"><span>{p.brand}</span><span>{categoryLabel(p.maincategory)}</span></div><Link className="product-name" to={`/product/${p.id}`}>{p.name}</Link><div className="price">{money(p.finalPrice)}{p.basePrice > p.finalPrice && <del>{money(p.basePrice)}</del>}<span className="product-color" title={p.color}>{p.color}</span></div></article>;
}
