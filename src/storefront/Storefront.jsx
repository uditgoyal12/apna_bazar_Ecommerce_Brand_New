import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Provider, Protected, useStore, Icon, Empty, ErrorBox, categoryLabel } from './shared';
import { api } from './api';
import { Home, Shop, Product, About, Contact, Testimonials } from './catalog';
import { Auth, Cart, Checkout, Confirmation, Wishlist, Account } from './customer';
import Admin from './Admin';
import './storefront.css';
function ScrollToTop() { const { pathname } = useLocation(); useEffect(() => { window.scrollTo(0, 0); }, [pathname]); return null; }
function ExperienceEffects() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const selector = '.hero-copy > *, .hero-visual, .benefits > div, .section-heading, .category-card, .product-card, .editorial > *, .brand-row a, .review-grid article, .newsletter > *, .page-heading > *, .shop-layout, .product-detail > *, .form-panel, .order-card, .admin-content > *';
    const observed = new WeakSet(), interactive = new WeakSet(), listeners = [];
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { rootMargin: '0px 0px -7% 0px', threshold: .08 });
    const canTilt = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const register = root => {
      const nodes = root.matches?.(selector) ? [root] : [...root.querySelectorAll?.(selector) || []];
      nodes.forEach((node, index) => {
        if (!observed.has(node)) { observed.add(node); node.classList.add('reveal-item'); node.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 55}ms`); observer.observe(node); }
      });
      if (!canTilt) return;
      const cards = root.matches?.('.product-card,.category-card,.review-grid article') ? [root] : [...root.querySelectorAll?.('.product-card,.category-card,.review-grid article') || []];
      cards.forEach(card => {
        if (interactive.has(card)) return;
        interactive.add(card); card.classList.add('depth-card');
        const move = event => { const box = card.getBoundingClientRect(); const x = (event.clientX - box.left) / box.width - .5, y = (event.clientY - box.top) / box.height - .5; card.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`); card.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`); card.style.setProperty('--light-x', `${((x + .5) * 100).toFixed(0)}%`); card.style.setProperty('--light-y', `${((y + .5) * 100).toFixed(0)}%`); };
        const leave = () => { card.style.setProperty('--tilt-x', '0deg'); card.style.setProperty('--tilt-y', '0deg'); };
        card.addEventListener('pointermove', move); card.addEventListener('pointerleave', leave); listeners.push([card, move, leave]);
      });
    };
    const root = document.getElementById('root'); register(root); document.documentElement.classList.add('motion-ready');
    const mutations = new MutationObserver(entries => entries.forEach(entry => entry.addedNodes.forEach(node => { if (node.nodeType === 1) register(node); })));
    mutations.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); listeners.forEach(([card, move, leave]) => { card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', leave); }); };
  }, [pathname, search]);
  return null;
}
function Header() {
  const { user, cart, wishlist, catalog } = useStore(), [menu, setMenu] = useState(false), [search, setSearch] = useState(false), navigate = useNavigate(), location = useLocation();
  useEffect(() => { setMenu(false); setSearch(false); }, [location]);
  return <><div className="announcement"><span>A little more style. A little more you.</span><span>Complimentary shipping on orders ₹1,999+ <Icon name="arrow" size={14}/></span><Link to="/contactus">Here to help</Link></div><header className="header"><div className="header-inner"><button className="icon-button mobile-menu" onClick={() => setMenu(!menu)} aria-label="Toggle menu" aria-expanded={menu}><Icon name={menu ? 'close' : 'menu'}/></button><Link to="/" className="wordmark">apna bazar<span>THE EVERYDAY EDIT</span></Link><nav className={menu ? 'nav open' : 'nav'} aria-label="Main navigation"><NavLink to="/shop">Discover</NavLink>{catalog.maincategory.map(c => <Link key={c.id} to={`/shop?maincategory=${encodeURIComponent(c.name)}`}>{categoryLabel(c.name)}</Link>)}<Link className="sale-link" to="/shop?sale=true">The sale edit</Link></nav><div className="header-actions"><button className="icon-button" aria-label="Search products" onClick={() => setSearch(!search)}><Icon name="search"/></button><Link className="icon-button account-icon" to={user ? '/profile' : '/login'} aria-label="My account"><Icon name="user"/></Link><Link className="icon-button" to="/wishlist" aria-label="Wishlist"><Icon name="heart"/>{wishlist.length > 0 && <small>{wishlist.length}</small>}</Link><Link className="icon-button" to="/cart" aria-label="Shopping bag"><Icon name="bag"/><small>{cart.items.reduce((n, i) => n + i.qty, 0)}</small></Link></div></div>{search && <form className="search-bar" onSubmit={e => { e.preventDefault(); navigate(`/shop?search=${encodeURIComponent(new FormData(e.currentTarget).get('search'))}`); }}><Icon name="search"/><input autoFocus aria-label="Search the collection" name="search" placeholder="Find your next favourite…"/><button className="btn small">Search</button><button type="button" className="icon-button" onClick={() => setSearch(false)} aria-label="Close search"><Icon name="close"/></button></form>}</header></>;
}
function Footer() {
  const { config, notify } = useStore(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <footer><div className="newsletter"><div><span className="eyebrow">GOOD TASTE. GREAT COMPANY.</span><h2>A little inspiration<br/>in your inbox.</h2><p>New arrivals, thoughtful edits and a first look at what’s next.</p></div><form onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; setBusy(true); setError(''); try { const r = await api('/newsletter', { method: 'POST', body: { email: new FormData(form).get('email') } }); notify(r.message); form.reset(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}><label htmlFor="newsletter-email">Your email address</label><div className="email-line"><input id="newsletter-email" type="email" name="email" placeholder="you@example.com" required/><button disabled={busy} aria-label="Subscribe to newsletter"><Icon name="arrow" size={26}/></button></div><small>By subscribing, you agree to receive emails from Apna Bazar.</small><ErrorBox error={error}/></form></div><div className="footer-main"><div><Link to="/" className="wordmark">apna bazar<span>THE EVERYDAY EDIT</span></Link><p>For the everyday.<br/>For the extraordinary you.</p></div><div><h4>Explore</h4><Link to="/shop">All collections</Link><Link to="/shop?sale=true">The sale edit</Link><Link to="/about">Our story</Link><Link to="/testimonials">Community</Link></div><div><h4>Make yourself at home</h4><Link to="/profile">My account</Link><Link to="/profile?tab=orders">Your orders</Link><Link to="/wishlist">Saved favourites</Link><Link to="/contactus">Contact us</Link></div><div><h4>Let’s talk</h4>{config.email && <a href={`mailto:${config.email}`}>{config.email}</a>}{config.phone && <a href={`tel:${config.phone}`}>{config.phone}</a>}<p className="footer-address">{config.address}</p></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Apna Bazar. Made for your everyday.</span><span>India · INR ₹ <span className="secure"><Icon name="shield" size={14}/> Secure checkout</span></span></div></footer>;
}
export default function Storefront() { return <BrowserRouter><Provider><ScrollToTop/><ExperienceEffects/><Header/><Routes><Route path="/" element={<Home/>}/><Route path="/shop" element={<Shop/>}/><Route path="/product/:id" element={<Product/>}/><Route path="/login" element={<Auth/>}/><Route path="/signup" element={<Auth/>}/><Route path="/cart" element={<Protected><Cart/></Protected>}/><Route path="/wishlist" element={<Protected><Wishlist/></Protected>}/><Route path="/checkout" element={<Protected><Checkout/></Protected>}/><Route path="/order-confirmation" element={<Protected><Confirmation/></Protected>}/><Route path="/profile" element={<Protected><Account/></Protected>}/><Route path="/update-profile" element={<Navigate to="/profile" replace/>}/><Route path="/admin/*" element={<Protected><Admin/></Protected>}/><Route path="/contactus" element={<Contact/>}/><Route path="/about" element={<About/>}/><Route path="/features" element={<About/>}/><Route path="/testimonial" element={<Testimonials/>}/><Route path="/testimonials" element={<Testimonials/>}/><Route path="*" element={<main className="page"><Empty title="A little off the beaten path." text="This page doesn’t exist. Let’s get you back to the good stuff."/></main>}/></Routes><Footer/></Provider></BrowserRouter>; }
