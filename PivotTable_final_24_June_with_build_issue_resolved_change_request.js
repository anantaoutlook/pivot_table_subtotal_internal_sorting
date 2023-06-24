/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
/* eslint-disable react/sort-prop-types */
import dt from 'datatables.net-bs';
import PropTypes from 'prop-types';
import {
  getTimeFormatter,
  getTimeFormatterForGranularity,
  smartDateFormatter,
  formatNumber,
} from '@superset-ui/core';
import { formatCellValue, formatDateCellValue } from './utils/formatCells';
import fixTableHeight from './utils/fixTableHeight';
import 'datatables.net-bs/css/dataTables.bootstrap.css';

if (window.$) {
  dt(window, window.$);
}
const $ = window.$ || dt.$;

const propTypes = {
  data: PropTypes.shape({
    // TODO: replace this with raw data in SIP-6
    html: PropTypes.string,
    columns: PropTypes.arrayOf(
      PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.arrayOf(PropTypes.string),
      ]),
    ),
  }),
  height: PropTypes.number,
  columnFormats: PropTypes.objectOf(PropTypes.string),
  numberFormat: PropTypes.string,
  numGroups: PropTypes.number,
  verboseMap: PropTypes.objectOf(PropTypes.string),
};

const hasOnlyTextChild = node =>
  node.childNodes.length === 1 &&
  node.childNodes[0].nodeType === Node.TEXT_NODE;

function PivotTable(element, props) {
  const {
    columnFormats,
    data,
    dateFormat,
    granularity,
    height,
    numberFormat,
    numGroups,
    verboseMap,
  } = props;
  console.log('props', props);

  const { html, columns } = data;
  const container = element;
  const $container = $(element);
  let dateFormatter;

  if (dateFormat === smartDateFormatter.id && granularity) {
    dateFormatter = getTimeFormatterForGranularity(granularity);
  } else if (dateFormat) {
    dateFormatter = getTimeFormatter(dateFormat);
  } else {
    dateFormatter = String;
  }

  // queryData data is a string of html with a single table element
  container.innerHTML = html;

  const cols = Array.isArray(columns[0]) ? columns.map(col => col[0]) : columns;
  const dateRegex = /^__timestamp:(-?\d*\.?\d*)$/;

  $container.find('th').each(function formatTh() {
    if (hasOnlyTextChild(this)) {
      const cellValue = formatDateCellValue(
        $(this).text(),
        verboseMap,
        dateRegex,
        dateFormatter,
      );
      $(this).text(cellValue);
    }
  });

  $container.find('tbody tr').each(function eachRow() {
    $(this)
      .find('td')
      .each(function eachTd(index) {
        if (hasOnlyTextChild(this)) {
          const tdText = $(this).text();
          const { textContent, sortAttributeValue } = formatCellValue(
            index,
            cols,
            tdText,
            columnFormats,
            numberFormat,
            dateRegex,
            dateFormatter,
          );
          $(this).text(textContent);
          $(this).attr('data-sort', sortAttributeValue);
        }
      });
  });

  let maxTh = 0;
  const allRows = $container.find('tbody tr');
  const allRowsWithSum = [];
  $container.find('tbody tr').each(function eachRow(index) {
    if (index === 0) {
      maxTh = $(this).find('th').length;
    }
    if ($(this).find('th').length === maxTh) {
      if ($(this).find('th')[0].attributes[0]) {
        if (
          $($(allRows[index])).find('th[rowspan').attr('rowspan') &&
          $($(allRows[index + 1]))
            .find('th[rowspan')
            .attr('rowspan') === undefined
        ) {
          const rowSpanCount = parseInt(
            $(this).find('th')[0].attributes[0].value,
            10,
          );

          const addition = {};
          const rowsArray = [];
          let newTHead = '';
          for (
            let rowSpanIndex = 0;
            rowSpanIndex < rowSpanCount;
            rowSpanIndex += 1
          ) {
            const tds = $(allRows[index + rowSpanIndex]).find('td');
            const tdLength = $(allRows[index + rowSpanIndex])
              .find('td')
              .toArray().length;
            let sortBy = 0;
            if (tdLength) {
              sortBy = tdLength > 1 ? 1 : 0;
            }
            tds.each(function (tdIndex) {
              if (
                $(tds[tdIndex]).attr('data-sort') !== '-Infinity' &&
                $(tds[tdIndex]).attr('data-sort') !== ''
              ) {
                const previous = addition[tdIndex] ? addition[tdIndex] : 0;
                delete addition[tdIndex];
                addition[tdIndex] =
                  parseFloat(previous) +
                  parseFloat($(tds[tdIndex]).attr('data-sort'));
              }
            });

            if (rowSpanIndex === 0) {
              newTHead = `<th rowspan="${rowSpanCount + 1}">${
                $(allRows[index + rowSpanIndex]).find('th[rowspan]')[0]
                  .innerHTML
              }</th>`;
              $(allRows[index + rowSpanIndex])
                .children('th')
                .eq(0)
                .remove();
              rowsArray.push({
                startIndex: index,
                value: tds[sortBy] ? parseFloat(tds[sortBy].innerHTML) : '',
                rowValue: `${$(allRows[index + rowSpanIndex])[0].innerHTML}`,
              });
            } else {
              rowsArray.push({
                startIndex: index,
                value: tds[sortBy] ? parseFloat(tds[sortBy].innerHTML) : '',
                rowValue: `${$(allRows[index + rowSpanIndex])[0].innerHTML}`,
              });
            }
          }
          const sortedArray = rowsArray.sort((a, b) => b.value - a.value);
          const $subTotalRow = $('<tr><th>Subtotal</th></tr>');
          const sumKeys = Object.keys(addition);
          const numberOfThToBeInserted = numGroups - 1;
          for (
            let thInsertIndex = 1;
            thInsertIndex < numberOfThToBeInserted;
            thInsertIndex += 1
          ) {
            $subTotalRow.append(`<th></th>`);
          }

          sumKeys.forEach(key => {
            if (addition.hasOwnProperty(key)) {
              const metric = cols[key];
              const format = columnFormats[metric] || numberFormat || '.3s';
              $subTotalRow.append(
                `<td style="font-weight:500;" data-sort="${
                  addition[key]
                }">${formatNumber(format, addition[key])}</td>`,
              );
            }
          });

          const subTotalRowData = `${$subTotalRow[0].innerHTML}`;
          allRowsWithSum.push({
            sum: addition,
            subTotal: subTotalRowData,
            sortedArray,
            newTHead,
          });
          $(allRows[index + (rowSpanCount - 1)]).after($subTotalRow);
        }

        if (
          $($(allRows[index])).find('th[rowspan').attr('rowspan') &&
          $($(allRows[index + 1]))
            .find('th[rowspan')
            .attr('rowspan')
        ) {
          const rowSpanCount = parseInt(
            $(this).find('th')[0].attributes[0].value,
            10,
          );

          const addition = {};
          const rowsArray = [];
          let newTHead = '';
          for (
            let rowSpanIndex = 0;
            rowSpanIndex < rowSpanCount;
            rowSpanIndex += 1
          ) {
            const tds = $(allRows[index + rowSpanIndex]).find('td');
            const tdLength = $(allRows[index + rowSpanIndex])
              .find('td')
              .toArray().length;
            let sortBy = 0;
            if (tdLength) {
              sortBy = tdLength > 1 ? 1 : 0;
            }
            tds.each(function (tdIndex) {
              if (
                $(tds[tdIndex]).attr('data-sort') !== '-Infinity' &&
                $(tds[tdIndex]).attr('data-sort') !== ''
              ) {
                const previous = addition[tdIndex] ? addition[tdIndex] : 0;
                delete addition[tdIndex];
                addition[tdIndex] =
                  parseFloat(previous) +
                  parseFloat($(tds[tdIndex]).attr('data-sort'));
              }
            });

            if (rowSpanIndex === 0) {
              newTHead = `<th rowspan="${rowSpanCount + 1}">${
                $(allRows[index + rowSpanIndex]).find('th[rowspan]')[0]
                  .innerHTML
              }</th>`;
              $(allRows[index + rowSpanIndex])
                .children('th')
                .eq(0)
                .remove();
              rowsArray.push({
                startIndex: index,
                value: tds[sortBy] ? parseFloat(tds[sortBy].innerHTML) : '',
                rowValue: `${$(allRows[index + rowSpanIndex])[0].innerHTML}`,
              });
            } else {
              let rowSpanCountOne = $($(allRows[index + rowSpanIndex]))
                .find('th[rowspan')
                .attr('rowspan');
              if (rowSpanCountOne) {
                rowSpanCountOne = parseInt(rowSpanCountOne, 10);
                const innerRowArray = [];
                let newTHeadOne = '';
                for (
                  let innerRowIndex = 0;
                  innerRowIndex < rowSpanCountOne;
                  innerRowIndex += 1
                ) {
                  const tdsOne = $(
                    $(allRows[index + rowSpanIndex + innerRowIndex])[0],
                  ).find('td');
                  let sortColValue = 0;
                  if (
                    $(tdsOne[sortBy]).attr('data-sort') !== '-Infinity' &&
                    $(tdsOne[sortBy]).attr('data-sort') !== ''
                  ) {
                    sortColValue = parseInt(
                      $(tdsOne[sortBy]).attr('data-sort'),
                      10,
                    );
                  }
                  if (innerRowIndex === 0) {
                    newTHeadOne = `<th rowspan="${rowSpanCountOne}">${
                      $(allRows[index + rowSpanIndex + innerRowIndex]).find(
                        'th[rowspan]',
                      )[0].innerHTML
                    }</th>`;
                    $(allRows[index + rowSpanIndex + innerRowIndex])
                      .children('th')
                      .eq(0)
                      .remove();
                    innerRowArray.push({
                      startIndex: index,
                      value: sortColValue,
                      rowValue: `${
                        $(allRows[index + rowSpanIndex + innerRowIndex])[0]
                          .innerHTML
                      }`,
                    });
                  } else {
                    innerRowArray.push({
                      startIndex: index,
                      value: sortColValue,
                      rowValue: `${
                        $(allRows[index + rowSpanIndex + innerRowIndex])[0]
                          .innerHTML
                      }`,
                    });
                  }
                }
                const sortedArray = innerRowArray.sort(
                  (a, b) => b.value - a.value,
                );
                sortedArray.forEach((sort, sortIndex) => {
                  if (sortIndex === 0) {
                    rowsArray.push({
                      value: sort.value,
                      rowValue: newTHeadOne + sort.rowValue,
                    });
                  } else {
                    rowsArray.push({
                      value: sort.value,
                      rowValue: sort.rowValue,
                    });
                  }
                });
              }
            }
          }
          const sortedArray = rowsArray.sort((a, b) => b.value - a.value);
          const $subTotalRow = $('<tr><th>subtotal</th></tr>');
          const sumKeys = Object.keys(addition);
          const numberOfThToBeInserted = numGroups - 1;
          for (
            let thInsertIndex = 1;
            thInsertIndex < numberOfThToBeInserted;
            thInsertIndex += 1
          ) {
            $subTotalRow.append(`<th></th>`);
          }

          sumKeys.forEach(key => {
            if (addition.hasOwnProperty(key)) {
              const metric = cols[key];
              const format = columnFormats[metric] || numberFormat || '.3s';
              $subTotalRow.append(
                `<td style="font-weight:500;" data-sort="${
                  addition[key]
                }">${formatNumber(format, addition[key])}</td>`,
              );
            }
          });

          const subTotalRowData = `${$subTotalRow[0].innerHTML}`;
          allRowsWithSum.push({
            sum: addition,
            subTotal: subTotalRowData,
            sortedArray,
            newTHead,
          });
          $(allRows[index + (rowSpanCount - 1)]).after($subTotalRow);
        }
      } else {
        const sum = {};
        const tds = $(allRows[index]).find('td');
        tds.each(function (tdIndex) {
          const previous = sum[tdIndex] ? sum[tdIndex] : 0;
          delete sum[tdIndex];
          sum[tdIndex] =
            parseInt(previous, 10) + parseInt(tds[tdIndex].innerHTML, 10);
        });
        allRowsWithSum.push({
          sum,
          rowData: $(allRows[index])[0].innerHTML,
        });
      }
    }
  });

  // sort records
  function keysrt(key) {
    return function (a, b) {
      if (a.hasOwnProperty('sum') && b.hasOwnProperty('sum')) {
        if (a.sum[key] > b.sum[key]) return -1;
      }
      return 0;
    };
  }

  function replaceAfterSort() {
    const lastElement = allRowsWithSum.pop();
    console.log('lastElement', lastElement);
    const sortedTable = allRowsWithSum.sort(keysrt(1));
    let rows = '';
    sortedTable.forEach(element => {
      let row = ``;
      if (element.sortedArray) {
        element.sortedArray.forEach((ele, rowIndex) => {
          if (rowIndex === 0) {
            row += `<tr>${element.newTHead} + ${ele.rowValue}</tr>`;
          } else {
            row += `<tr>${ele.rowValue}</tr>`;
          }
        });
        row += `${element.subTotal}`;
        rows += row;
      } else {
        rows += `<tr>${element.rowData}</tr>`;
      }
    });
    rows += `<tr>${lastElement.rowData}</tr>`;
    $('tbody').empty();
    $('tbody').append(rows);
  }
  replaceAfterSort();

  $container.find('table').each(function fullWidth() {
    this.style = 'width: 100%';
  });

  if (numGroups === 1) {
    // When there is only 1 group by column,
    // we use the DataTable plugin to make the header fixed.
    // The plugin takes care of the scrolling so we don't need
    // overflow: 'auto' on the table.
    container.style.overflow = 'hidden';
    const table = $container.find('table').DataTable({
      paging: false,
      searching: false,
      bInfo: false,
      scrollY: `${height}px`,
      scrollCollapse: true,
      scrollX: true,
    });
    table.column('-1').order('desc').draw();
    fixTableHeight($container.find('.dataTables_wrapper'), height);
  } else {
    // When there is more than 1 group by column we just render the table, without using
    // the DataTable plugin, so we need to handle the scrolling ourselves.
    // In this case the header is not fixed.
    container.style.overflow = 'auto';
    container.style.height = `${height + 10}px`;
  }
}

PivotTable.displayName = 'PivotTable';
PivotTable.propTypes = propTypes;

export default PivotTable;
