import { useEffect, useState, useCallback } from 'react';
import { api, session, firstError, rules } from './api.js';

function Field({ label, type = 'text', value, onChange, ...rest }) {
  return (
    <label>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </label>
  );
}

// Generic form: fields = [[key, label, type?]]; validate = keys checked with client rules.
function Form({ fields, validate, submitLabel, onSubmit, extra }) {
  const [v, setV] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const err = firstError(validate, v);
    if (err) return setMsg({ err });
    setBusy(true);
    try {
      await onSubmit(v);
      setV({});
      setMsg({ ok: 'Saved.' });
    } catch (x) {
      setMsg({ err: x.message });
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="form">
      {fields.map(([k, label, type]) => (
        <Field key={k} label={label} type={type} value={v[k] || ''} onChange={(x) => setV({ ...v, [k]: x })} />
      ))}
      {extra && extra(v, setV)}
      {msg && <p className={msg.err ? 'msg err' : 'msg ok'} role="alert">{msg.err || msg.ok}</p>}
      <button className="primary" disabled={busy}>{submitLabel}</button>
    </form>
  );
}

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [done, setDone] = useState('');
  return (
    <main className="card narrow">
      <h1>Store Ratings</h1>
      <div className="tabs">
        <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Sign in</button>
        <button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
      </div>
      {done && <p className="msg ok">{done}</p>}
      {mode === 'login' ? (
        <Form fields={[['email', 'Email'], ['password', 'Password', 'password']]} validate={[]} submitLabel="Sign in"
          onSubmit={async (v) => { const s = await api('/auth/login', { method: 'POST', body: v }); session.set(s); onLogin(s.user); }} />
      ) : (
        <Form fields={[['name', 'Name (20-60 characters)'], ['email', 'Email'], ['address', 'Address'], ['password', 'Password', 'password']]}
          validate={['name', 'email', 'address', 'password']} submitLabel="Create account"
          onSubmit={async (v) => { await api('/auth/signup', { method: 'POST', body: v }); setMode('login'); setDone('Account created. Sign in to continue.'); }} />
      )}
    </main>
  );
}

// Sortable table. columns = [[key, label]]; sorting is done by the API.
function Table({ columns, rows, sort, order, onSort, render = {}, empty }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {columns.map(([k, l]) => (
              <th key={k} aria-sort={sort === k ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                {onSort ? <button className="link" onClick={() => onSort(k)}>{l}{sort === k ? (order === 'asc' ? ' ▲' : ' ▼') : ''}</button> : l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>{columns.map(([k]) => <td key={k}>{render[k] ? render[k](r) : r[k] ?? '—'}</td>)}</tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} className="empty">{empty || 'Nothing here yet.'}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Loads a list from the API with filters + sorting.
function useList(path, initialSort = 'name') {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(initialSort);
  const [order, setOrder] = useState('asc');
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    api(path, { query: { ...filters, sort, order } }).then((r) => { setRows(r); setErr(''); }).catch((e) => setErr(e.message));
  }, [path, filters, sort, order]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const onSort = (k) => { if (k === sort) setOrder(order === 'asc' ? 'desc' : 'asc'); else { setSort(k); setOrder('asc'); } };
  return { rows, filters, setFilters, sort, order, onSort, err, reload: load };
}

function Filters({ keys, filters, setFilters, roles }) {
  return (
    <div className="filters">
      {keys.map((k) => (
        <input key={k} placeholder={`Filter by ${k}`} aria-label={`Filter by ${k}`} value={filters[k] || ''}
          onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} />
      ))}
      {roles && (
        <select aria-label="Filter by role" value={filters.role || ''} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
          <option value="">All roles</option><option value="ADMIN">Admin</option><option value="USER">Normal user</option><option value="OWNER">Store owner</option>
        </select>
      )}
    </div>
  );
}

function Admin() {
  const [tab, setTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [detail, setDetail] = useState(null);
  const users = useList('/admin/users');
  const stores = useList('/admin/stores');
  useEffect(() => { api('/admin/stats').then(setStats).catch(() => {}); }, [tab, users.rows.length, stores.rows.length]);
  const owners = users.rows.filter((u) => u.role === 'OWNER');
  return (
    <>
      <div className="tabs">
        {['dashboard', 'users', 'stores', 'add user', 'add store'].map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>
      {tab === 'dashboard' && stats && (
        <div className="stats">
          <div><b>{stats.users}</b>Users</div><div><b>{stats.stores}</b>Stores</div><div><b>{stats.ratings}</b>Ratings</div>
        </div>
      )}
      {tab === 'users' && (
        <>
          <Filters keys={['name', 'email', 'address']} roles filters={users.filters} setFilters={users.setFilters} />
          {users.err && <p className="msg err">{users.err}</p>}
          <Table columns={[['name', 'Name'], ['email', 'Email'], ['address', 'Address'], ['role', 'Role'], ['id', 'Details']]}
            rows={users.rows} sort={users.sort} order={users.order} onSort={(k) => k !== 'id' && users.onSort(k)}
            render={{ id: (r) => <button className="link" onClick={() => api('/admin/users/' + r.id).then(setDetail)}>View</button> }} />
          {detail && (
            <aside className="card detail">
              <h3>{detail.name}</h3>
              <p>{detail.email}<br />{detail.address}<br />Role: {detail.role}</p>
              {detail.role === 'OWNER' && <p>Store rating: {detail.rating ?? 'No ratings yet'}</p>}
              <button onClick={() => setDetail(null)}>Close</button>
            </aside>
          )}
        </>
      )}
      {tab === 'stores' && (
        <>
          <Filters keys={['name', 'email', 'address']} filters={stores.filters} setFilters={stores.setFilters} />
          <Table columns={[['name', 'Name'], ['email', 'Email'], ['address', 'Address'], ['rating', 'Rating']]}
            rows={stores.rows} sort={stores.sort} order={stores.order} onSort={stores.onSort} />
        </>
      )}
      {tab === 'add user' && (
        <Form fields={[['name', 'Name (20-60 characters)'], ['email', 'Email'], ['address', 'Address'], ['password', 'Password', 'password']]}
          validate={['name', 'email', 'address', 'password']} submitLabel="Add user"
          extra={(v, setV) => (
            <label>Role
              <select value={v.role || 'USER'} onChange={(e) => setV({ ...v, role: e.target.value })}>
                <option value="USER">Normal user</option><option value="ADMIN">Admin</option><option value="OWNER">Store owner</option>
              </select>
            </label>
          )}
          onSubmit={async (v) => { await api('/admin/users', { method: 'POST', body: { ...v, role: v.role || 'USER' } }); users.reload(); }} />
      )}
      {tab === 'add store' && (
        <Form fields={[['name', 'Store name'], ['email', 'Store email'], ['address', 'Address']]} validate={['email', 'address']} submitLabel="Add store"
          extra={(v, setV) => (
            <label>Owner (optional)
              <select value={v.ownerId || ''} onChange={(e) => setV({ ...v, ownerId: e.target.value })}>
                <option value="">No owner</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
          onSubmit={async (v) => { await api('/admin/stores', { method: 'POST', body: v }); stores.reload(); }} />
      )}
    </>
  );
}

function StoreList() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [order, setOrder] = useState('asc');
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    api('/stores', { query: { search, sort, order } }).then(setRows).catch((e) => setMsg({ err: e.message }));
  }, [search, sort, order]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const rate = async (id, rating) => {
    try { await api(`/stores/${id}/rating`, { method: 'PUT', body: { rating } }); setMsg({ ok: 'Rating saved.' }); load(); }
    catch (e) { setMsg({ err: e.message }); }
  };
  const onSort = (k) => { if (k === sort) setOrder(order === 'asc' ? 'desc' : 'asc'); else { setSort(k); setOrder('asc'); } };
  return (
    <>
      <div className="filters"><input placeholder="Search by name or address" aria-label="Search stores" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {msg && <p className={msg.err ? 'msg err' : 'msg ok'} role="alert">{msg.err || msg.ok}</p>}
      <Table columns={[['name', 'Store'], ['address', 'Address'], ['rating', 'Overall rating'], ['my_rating', 'Your rating']]}
        rows={rows} sort={sort} order={order} onSort={(k) => k !== 'my_rating' && onSort(k)} empty="No stores match your search."
        render={{
          rating: (r) => (r.rating || 'No ratings'),
          my_rating: (r) => (
            <select aria-label={`Your rating for ${r.name}`} value={r.my_rating || ''} onChange={(e) => rate(r.id, Number(e.target.value))}>
              <option value="" disabled>{'Rate…'}</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ),
        }} />
    </>
  );
}

function Owner() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/owner/dashboard').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="msg err">{err}</p>;
  if (!d) return <p>Loading…</p>;
  if (!d.store) return <p className="empty">No store is linked to your account yet. Ask an administrator to assign one.</p>;
  return (
    <>
      <div className="stats"><div><b>{d.average || '—'}</b>Average rating for {d.store.name}</div><div><b>{d.raters.length}</b>Ratings received</div></div>
      <Table columns={[['name', 'Name'], ['email', 'Email'], ['rating', 'Rating']]} rows={d.raters} empty="No one has rated your store yet." />
    </>
  );
}

function Account() {
  return (
    <section className="card narrow">
      <h3>Change password</h3>
      <Form fields={[['currentPassword', 'Current password', 'password'], ['newPassword', 'New password', 'password']]} validate={[]} submitLabel="Update password"
        onSubmit={async (v) => {
          if (rules.password(v.newPassword || '') !== true) throw new Error(rules.password(''));
          await api('/auth/password', { method: 'PUT', body: v });
        }} />
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(session.get()?.user || null);
  const [account, setAccount] = useState(false);
  if (!user) return <Auth onLogin={setUser} />;
  const logout = () => { session.clear(); setUser(null); };
  const titles = { ADMIN: 'Administrator', USER: 'Stores', OWNER: 'My store' };
  return (
    <div className="shell">
      <header>
        <h1>{titles[user.role]}</h1>
        <div>
          <span>{user.name}</span>
          {user.role !== 'ADMIN' && <button onClick={() => setAccount(!account)}>{account ? 'Back' : 'Password'}</button>}
          <button onClick={logout}>Sign out</button>
        </div>
      </header>
      {account ? <Account /> : user.role === 'ADMIN' ? <Admin /> : user.role === 'USER' ? <StoreList /> : <Owner />}
    </div>
  );
}
