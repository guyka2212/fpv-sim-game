/** A message box with an OK button, in place of alert(): a controller can close it (A or B). */
export function notice(text: string): void {
  let box = document.getElementById('notice');
  if (!box) {
    box = document.createElement('div');
    box.id = 'notice';
    box.innerHTML = '<div class="panel"><p id="notice-text"></p><div class="row"><button id="notice-ok" class="fly">OK</button></div></div>';
    document.body.appendChild(box);
    box.querySelector('#notice-ok')!.addEventListener('click', () => box!.classList.add('hidden'));
  }
  box.querySelector('#notice-text')!.textContent = text;
  box.classList.remove('hidden');
}
