function Table({ columns, data }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full table-auto bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="whitespace-nowrap px-3 py-3 font-semibold sm:px-4">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                className="px-3 py-6 text-center text-slate-500 sm:px-4"
                colSpan={columns.length}
              >
                Ma'lumot topilmadi
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={row._id || row.id || rowIndex}
                className="border-t border-slate-100"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="whitespace-normal break-words px-3 py-3 align-top text-slate-700 sm:px-4"
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;
