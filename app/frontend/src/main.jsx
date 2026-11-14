import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const MAX_LENGTH = 1000;

async function api(path, options) {
  const response = await fetch(path, options);
  let data;
  try { data = await response.json(); } catch { throw new Error('We couldn’t reach the server. Please try again.'); }
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function App() {
  const [posts, setPosts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [retryBefore, setRetryBefore] = useState(null);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [notice, setNotice] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const textarea = useRef(null);
  const dialog = useRef(null);
  const requestId = useRef(0);
  const length = Array.from(body).length;

  async function loadPosts(before = null) {
    const id = ++requestId.current;
    setLoading(true);
    setFeedError('');
    setRetryBefore(before);
    try {
      const data = await api(`/api/posts${before ? `?before=${encodeURIComponent(before)}` : ''}`);
      if (id !== requestId.current) return;
      setPosts(current => before ? [...current, ...data.posts.filter(post => !current.some(existing => existing.id === post.id))] : data.posts);
      setCursor(data.next_cursor);
    } catch (error) {
      if (id === requestId.current) setFeedError(error.message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => { loadPosts(); }, []);
  useEffect(() => {
    if (privacyOpen) dialog.current.showModal();
    else dialog.current.close();
  }, [privacyOpen]);

  async function submit(event) {
    event.preventDefault();
    if (posting || !body.trim() || length > MAX_LENGTH) return;
    setPosting(true);
    setPostError('');
    setNotice('');
    try {
      const post = await api('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      ++requestId.current;
      setLoading(false);
      setFeedError('');
      setPosts(current => [post, ...current]);
      setBody('');
      setNotice('Your thought is out there. Thank you for sharing.');
      await loadPosts();
    } catch (error) { setPostError(error.message); }
    finally { setPosting(false); }
  }

  function startWriting() {
    textarea.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textarea.current.focus({ preventScroll: true });
  }

  return <>
    <header className="header">
      <a className="wordmark" href="/" aria-label="Unsaid home"><span className="brand-mark" aria-hidden="true">u.</span>unsaid</a>
      <nav aria-label="Main navigation"><button className="text-button privacy-link" onClick={() => setPrivacyOpen(true)}>A note on privacy</button><button className="nav-write" onClick={startWriting}>Let it out <Arrow /></button></nav>
    </header>
    <main className="layout">
      <aside className="intro">
        <div className="eyebrow"><span className="small-star">✳</span> A SHARED SPACE. NO NAMES.</div>
        <h1>Some things<br />are easier<br />left <em>unsaid.</em></h1>
        <p className="intro-copy">But they don’t have to stay that way.<br />A little corner of the internet for whatever’s on your mind.</p>
        <div className="line-art" aria-hidden="true"><svg viewBox="0 0 260 160" fill="none"><path d="M22 135C85 153 58 29 110 31C163 33 89 153 150 132C211 111 138 13 187 24C219 31 207 93 240 75" stroke="currentColor" strokeWidth="2"/><path d="m226 73 16 1-6 15" stroke="currentColor" strokeWidth="2"/></svg></div>
        <div className="space-note"><span aria-hidden="true">◌</span><p>No profiles. No followers.<br />Just a little more human.</p></div>
        <div className="side-footer">A place to be yourself.<br />Even without your name.</div>
      </aside>

      <section className="feed-column" aria-label="Anonymous community">
        <form className="composer" onSubmit={submit}>
          <div className="composer-heading"><span className="anonymous-avatar" aria-hidden="true">✳</span><div><strong>You, anonymously</strong><span>A thought, a confession, a small win.</span></div><span className="private-tag"><span aria-hidden="true">◈</span> NO NAME NEEDED</span></div>
          <label className="sr-only" htmlFor="thought">Your anonymous post</label>
          <textarea ref={textarea} id="thought" placeholder="What’s something you haven’t said out loud?" value={body} onChange={event => { setBody(event.target.value); setNotice(''); }} disabled={posting} aria-describedby="post-help post-count" />
          <div className="composer-bottom"><span id="post-count" className={length > MAX_LENGTH ? 'over-limit' : ''}>{length.toLocaleString()} <span>/ 1,000</span></span><button className="post-button" disabled={posting || !body.trim() || length > MAX_LENGTH}>{posting ? 'Sharing…' : 'Share a thought'} <Arrow /></button></div>
          <p id="post-help" className="composer-help">Be kind. Leave names and personal details out.</p>
          {postError && <p role="alert" className="error-message">{postError} Your draft is still here.</p>}
          <p role="status" className={notice ? 'success-message' : 'sr-only'}>{notice}</p>
        </form>
        <div className="feed-heading"><h2>The things we carry <span aria-hidden="true">↘</span></h2><button className="refresh-button" onClick={() => loadPosts()} disabled={loading}>Newest first <span aria-hidden="true">↻</span></button></div>
        <div className="feed" aria-busy={loading}>
          {posts.map(post => <article className="post-card" key={post.id}><div className="post-meta"><span className={`post-avatar tone-${Number(post.id) % 4}`} aria-hidden="true">{['✳', '◒', '✺', '◈'][Number(post.id) % 4]}</span><span>Someone, somewhere</span><time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(post.created_at))}</time></div><p className="post-body">{post.body}</p><div className="post-foot"><span className="post-number">THOUGHT {String(post.id).padStart(3, '0')}</span><span className="small-orbit" aria-label="Shared anonymously">◌</span></div></article>)}
          {loading && <div className="loading-state" role="status"><span className="loading-dot" /> Gathering thoughts…</div>}
          {feedError && <div className="feed-state" role="alert"><h3>A moment of quiet.</h3><p>{feedError}</p><button className="outline-button" onClick={() => loadPosts(retryBefore)}>Try again <Arrow /></button></div>}
          {!loading && !feedError && posts.length === 0 && <div className="feed-state empty-state"><span className="empty-symbol" aria-hidden="true">✳</span><h3>Every conversation starts<br />with one thought.</h3><p>This space is yours. Be the first to leave something here.</p><button className="outline-button" onClick={startWriting}>Write the first thought <Arrow /></button></div>}
          {cursor && !loading && !feedError && <button className="load-more" onClick={() => loadPosts(cursor)}>A few more thoughts <span aria-hidden="true">↓</span></button>}
        </div>
        <footer className="feed-footer"><span aria-hidden="true">✳</span> Different lives. Familiar feelings.</footer>
      </section>
    </main>
    <dialog ref={dialog} onCancel={() => setPrivacyOpen(false)} onClick={event => { if (event.target === dialog.current) setPrivacyOpen(false); }} aria-labelledby="privacy-title"><div className="dialog-content"><button className="dialog-close" aria-label="Close privacy note" onClick={() => setPrivacyOpen(false)}>×</button><span className="eyebrow">A NOTE ON PRIVACY</span><h2 id="privacy-title">Your words.<br />Without your name.</h2><p>Unsaid has no accounts, profiles, or public author identities. Posts contain only your text, a post number, and the time you shared it.</p><p>Everything you post is public. Don’t include names, contact details, or anything that could identify you or someone else. Posts cannot currently be edited or deleted from this app.</p><p>This is not a guarantee of complete anonymity: your hosting provider or network may retain connection logs such as IP addresses.</p><button className="post-button" onClick={() => setPrivacyOpen(false)}>Got it <Arrow /></button></div></dialog>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
