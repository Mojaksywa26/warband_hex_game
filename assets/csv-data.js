(() => {
  'use strict';

  // Shared by standalone tools. The match keeps its specialized normalizers;
  // this helper only handles CSV transport and display-oriented conveniences.
  const parseCSV = text => {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text ?? '').replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index++) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index++;
        } else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === ',') {
        row.push(field);
        field = '';
      } else if (character === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (character !== '\r') field += character;
    }
    row.push(field);
    rows.push(row);
    if (!rows.length || !rows[0].some(value => value.trim())) return [];
    const headers = rows.shift().map(header => header.trim());
    return rows.filter(values => values.some(value => value.trim())).map(values =>
      Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()]))
    );
  };

  const readCSV = async path => {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
    return parseCSV(await response.text());
  };

  const list = value => String(value ?? '').split('|').map(item => item.trim()).filter(Boolean);
  const text = (row, field, language = 'en') => {
    if (!row) return '';
    if (language !== 'en') {
      const localized = row[`${field}_${language}`];
      if (localized) return localized;
    }
    return row[field] || '';
  };

  window.WarbandCSV = Object.freeze({ parseCSV, readCSV, list, text });
})();
