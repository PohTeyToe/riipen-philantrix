/** Prints one report: the print stylesheet hides everything else, and the file name comes from the title. */
export function printReport(id: string, fileName: string) {
  const title = document.title;
  document.title = fileName;
  document.body.dataset.print = id;
  document.querySelector(`[data-report="${id}"]`)?.setAttribute('data-printing', '');
  const restore = () => {
    document.title = title;
    delete document.body.dataset.print;
    document.querySelectorAll('[data-printing]').forEach((el) => el.removeAttribute('data-printing'));
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}
