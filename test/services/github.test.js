'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseContributionsHtml, yearChunks } = require('../../src/services/github');
const { parseDay, formatDay } = require('../../src/core/dates');

// Trimmed copy of the markup github.com/users/<login>/contributions returns.
const HTML = `
<table class="ContributionCalendar-grid"><tbody><tr>
<td tabindex="0" data-ix="1" aria-selected="false" style="width: 10px" data-date="2025-01-05" id="contribution-day-component-0-1" data-level="1" role="gridcell" data-view-component="true" class="ContributionCalendar-day"></td>
<td tabindex="0" data-ix="2" style="width: 10px" data-date="2025-01-12" id="contribution-day-component-0-2" data-level="0" role="gridcell" class="ContributionCalendar-day"></td>
<td tabindex="0" data-ix="3" data-level="4" data-date="2025-01-19" id="contribution-day-component-0-3" class="ContributionCalendar-day"></td>
<td tabindex="0" data-ix="4" data-date="2025-01-26" id="contribution-day-component-0-4" data-level="2" class="ContributionCalendar-day"></td>
</tr></tbody></table>
<tool-tip id="tooltip-a" for="contribution-day-component-0-1" popover="manual" class="sr-only position-absolute">4 contributions on January 5th.</tool-tip>
<tool-tip id="tooltip-b" for="contribution-day-component-0-2" popover="manual" class="sr-only position-absolute">No contributions on January 12th.</tool-tip>
<tool-tip id="tooltip-c" for="contribution-day-component-0-3" popover="manual" class="sr-only position-absolute">1,204 contributions on January 19th.</tool-tip>
`;

test('parseContributionsHtml reads counts from tooltips', () => {
  const counts = parseContributionsHtml(HTML);
  assert.equal(counts.get('2025-01-05'), 4);
  assert.equal(counts.get('2025-01-12'), 0);
  assert.equal(counts.get('2025-01-19'), 1204);
});

test('parseContributionsHtml falls back to the level without a tooltip', () => {
  assert.equal(parseContributionsHtml(HTML).get('2025-01-26'), 2);
});

test('yearChunks splits a range by calendar year', () => {
  const chunks = yearChunks(parseDay('2025-11-02'), parseDay('2026-11-01'));
  assert.deepEqual(
    chunks.map((c) => [c.year, formatDay(c.from), formatDay(c.to)]),
    [
      [2025, '2025-11-02', '2025-12-31'],
      [2026, '2026-01-01', '2026-11-01'],
    ],
  );
});
