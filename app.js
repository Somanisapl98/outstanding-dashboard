let DATA = null;
let filtered = [];

const el = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2
}).format(Number(n || 0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

fetch('dashboard-data.json?v=' + Date.now())
  .then(r => {
    if (!r.ok) throw new Error('dashboard-data.json not found. Run the update script first.');
    return r.json();
  })
  .then(d => { DATA = d; init(); })
  .catch(e => {
    document.body.innerHTML = `<div style="padding:30px"><h2>Dashboard cannot load</h2><p>${esc(e.message)}</p></div>`;
  });

function optionList(values, firstLabel) {
  return `<option value="">${esc(firstLabel)}</option>` +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

function init() {
  el('updated').textContent = 'Updated: ' + DATA.lastUpdated;
  el('cutoff').textContent = DATA.tallyCutoff || 'Not detected';

  const statuses = [...new Set(DATA.records.map(r => r.status).filter(Boolean))].sort();
  const codeStatuses = [...new Set(DATA.records.map(r => r.code_status).filter(Boolean))].sort();
  const locations = [...new Set(DATA.records.map(r => r.location).filter(Boolean))].sort();

  el('status').innerHTML = optionList(statuses, 'All reconciliation statuses');
  el('code').innerHTML = optionList(codeStatuses, 'All dealer-code checks');
  el('location').innerHTML = optionList(locations, 'All locations');

  buildCards();

  el('search').addEventListener('input', applyFilters);
  el('status').addEventListener('change', applyFilters);
  el('code').addEventListener('change', applyFilters);
  el('location').addEventListener('change', applyFilters);

  el('clear').addEventListener('click', () => {
    el('search').value = '';
    el('status').value = '';
    el('code').value = '';
    el('location').value = '';
    applyFilters();
  });

  el('export').addEventListener('click', exportFilteredExcel);

  el('warning').style.display = 'block';
  el('warning').textContent = `Only bills dated on or before ${DATA.tallyCutoff} are reconciled. Later bills are shown as AFTER TALLY CUTOFF - NOT COMPARED.`;

  applyFilters();
}

function buildCards() {
  const summary = DATA.summary || {};
  const counts = summary.counts || {};
  const amounts = summary.amounts || {};
  const codeCounts = summary.codeCounts || {};

  const cards = [
    {title:'Tally Outstanding', value:money(summary.tallyTotal), type:'all'},
    {title:'Alignbook Outstanding', value:money(summary.alignbookTotal), type:'all'},
    {title:'E-Dukan Outstanding', value:money(summary.edukanTotal), type:'all'},
    {title:'Unique Bills', value:summary.uniqueBills || 0, type:'all'},
    {title:'Dealer Code Mismatch', value:codeCounts['CODE MISMATCH'] || 0, type:'code', filter:'CODE MISMATCH'},
    ...Object.keys(counts).sort().map(status => ({
      title: status,
      value: counts[status],
      amount: money(amounts[status] || 0),
      type:'status',
      filter:status
    }))
  ];

  el('cards').innerHTML = cards.map((c, i) => `
    <div class="card" data-index="${i}">
      <h3>${esc(c.title)}</h3>
      <div class="value">${esc(c.value)}</div>
      ${c.amount ? `<small>${esc(c.amount)}</small>` : ''}
    </div>`).join('');

  document.querySelectorAll('#cards .card').forEach(card => {
    card.addEventListener('click', () => {
      const c = cards[Number(card.dataset.index)];
      el('search').value = '';
      el('location').value = '';
      if (c.type === 'status') {
        el('status').value = c.filter;
        el('code').value = '';
      } else if (c.type === 'code') {
        el('status').value = '';
        el('code').value = c.filter;
      } else {
        el('status').value = '';
        el('code').value = '';
      }
      applyFilters();
      document.querySelector('.filters').scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
}

function applyFilters() {
  const searchTerms = el('search').value.toUpperCase().split(',').map(x => x.trim()).filter(Boolean);
  const status = el('status').value;
  const code = el('code').value;
  const location = el('location').value;

  filtered = DATA.records.filter(r => {
    const haystack = [
      r.bill, r.original_tally_bill, r.tally_name, r.tally_code,
      r.alignbook_name, r.alignbook_code, r.edukan_name,
      r.edukan_account_id, r.location
    ].join(' ').toUpperCase();

    return (!status || r.status === status) &&
      (!code || r.code_status === code) &&
      (!location || r.location === location) &&
      (!searchTerms.length || searchTerms.some(term => haystack.includes(term)));
  });

  renderRows();
}

function renderRows() {
  const active = [];
  if (el('status').value) active.push('Status: ' + el('status').value);
  if (el('code').value) active.push('Code: ' + el('code').value);
  if (el('location').value) active.push('Location: ' + el('location').value);
  if (el('search').value.trim()) active.push('Search: ' + el('search').value.trim());

  el('shown').textContent = `Showing ${filtered.length.toLocaleString('en-IN')} of ${DATA.records.length.toLocaleString('en-IN')} bills` +
    (active.length ? ` | ${active.join(' | ')}` : '');

  el('rows').innerHTML = filtered.slice(0, 10000).map(r => `
    <tr>
      <td>${esc(r.bill)}</td><td>${esc(r.original_tally_bill)}</td>
      <td>${esc(r.bill_date)}</td><td>${esc(r.location)}</td>
      <td>${esc(r.tally_name)}</td><td>${esc(r.tally_code)}</td>
      <td>${esc(r.alignbook_name)}</td><td>${esc(r.alignbook_code)}</td>
      <td>${esc(r.edukan_name)}</td><td>${esc(r.edukan_account_id)}</td>
      <td class="num">${money(r.tally)}</td><td class="num">${money(r.alignbook)}</td>
      <td class="num">${money(r.edukan)}</td><td class="num">${money(r.diff_alignbook)}</td>
      <td class="num">${money(r.diff_edukan)}</td>
      <td class="status ${r.code_status === 'CODE MATCH' ? 'match' : 'review'}">${esc(r.code_status)}</td>
      <td class="status ${r.status === 'MATCH IN ALL' ? 'match' : r.status.includes('CUTOFF') ? 'review' : 'bad'}">${esc(r.status)}</td>
    </tr>`).join('');
}

function exportFilteredExcel() {
  if (!filtered.length) {
    alert('No rows are available for the current filters.');
    return;
  }

  const headers = [
    'Bill No','Original Tally Bill','Bill Date','Location','Tally Dealer','Tally Code',
    'Alignbook Customer','Alignbook Code','E-Dukan Customer','E-Dukan Account ID',
    'Tally Outstanding','Alignbook Outstanding','E-Dukan Outstanding',
    'Tally-Alignbook Difference','Tally-E-Dukan Difference','Code Check','Reconciliation Status'
  ];
  const keys = [
    'bill','original_tally_bill','bill_date','location','tally_name','tally_code',
    'alignbook_name','alignbook_code','edukan_name','edukan_account_id',
    'tally','alignbook','edukan','diff_alignbook','diff_edukan','code_status','status'
  ];

  const filterSummary = [
    ['Exported At', new Date().toLocaleString('en-IN')],
    ['Tally Cutoff', DATA.tallyCutoff || ''],
    ['Reconciliation Status Filter', el('status').value || 'All'],
    ['Dealer Code Filter', el('code').value || 'All'],
    ['Location Filter', el('location').value || 'All'],
    ['Search Filter', el('search').value || 'None'],
    ['Exported Rows', filtered.length]
  ];

  const summaryRows = filterSummary.map(x => `<tr><th>${esc(x[0])}</th><td>${esc(x[1])}</td></tr>`).join('');
  const dataRows = filtered.map(r => `<tr>${keys.map(k => `<td>${esc(r[k])}</td>`).join('')}</tr>`).join('');
  const html = `<html><head><meta charset="UTF-8"></head><body>
    <table border="1">${summaryRows}</table><br>
    <table border="1"><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${dataRows}</table>
    </body></html>`;

  const safe = (el('status').value || el('code').value || 'All_Results').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const date = new Date().toISOString().slice(0,10);
  const blob = new Blob([html], {type:'application/vnd.ms-excel'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Outstanding_${safe}_${date}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
