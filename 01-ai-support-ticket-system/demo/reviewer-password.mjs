import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
// Private interactive password entry; never prints the password or writes plaintext.
import fs from'node:fs';import{spawnSync}from'node:child_process';import{randomBytes,scryptSync,timingSafeEqual}from'node:crypto';import{fileURLToPath}from'node:url';import{configFile,readReviewerConfig}from'./reviewer-private.mjs';
const gui=String.raw`[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
$f=New-Object Windows.Forms.Form;$f.Text='Private DEMO reviewer password';$f.Width=470;$f.Height=260;$f.StartPosition='CenterScreen';$f.TopMost=$true
$l=New-Object Windows.Forms.Label;$l.Text='Set a NEW private reviewer password (12–128 characters).';$l.Left=20;$l.Top=15;$l.Width=420;$f.Controls.Add($l)
$a=New-Object Windows.Forms.TextBox;$a.Left=20;$a.Top=50;$a.Width=410;$a.UseSystemPasswordChar=$true;$f.Controls.Add($a)
$l2=New-Object Windows.Forms.Label;$l2.Text='Confirm password';$l2.Left=20;$l2.Top=85;$l2.Width=400;$f.Controls.Add($l2)
$b=New-Object Windows.Forms.TextBox;$b.Left=20;$b.Top=110;$b.Width=410;$b.UseSystemPasswordChar=$true;$f.Controls.Add($b)
$ok=New-Object Windows.Forms.Button;$ok.Text='Save private password';$ok.Left=20;$ok.Top=155;$ok.Width=190;$f.Controls.Add($ok)
$cancel=New-Object Windows.Forms.Button;$cancel.Text='Cancel';$cancel.Left=235;$cancel.Top=155;$cancel.Width=190;$cancel.DialogResult=[Windows.Forms.DialogResult]::Cancel;$f.Controls.Add($cancel);$f.CancelButton=$cancel
$ok.Add_Click({if($a.Text.Length -lt 12 -or $a.Text.Length -gt 128 -or $a.Text -cne $b.Text){$l.Text='Passwords must match and contain 12–128 characters.'}else{$f.DialogResult=[Windows.Forms.DialogResult]::OK;$f.Close()}})
if($f.ShowDialog() -eq [Windows.Forms.DialogResult]::OK){[Console]::Write($a.Text)};$a.Clear();$b.Clear();$f.Dispose()`;
async function readPassword() {
  if (!process.argv.includes('--terminal')) {
    const r=spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-STA','-Command',gui],{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4096});if(r.status!==0||!r.stdout)throw Error('PASSWORD_ENTRY_CANCELLED');
    return r.stdout;
  }
  if (!process.stdin.isTTY) throw Error('INTERACTIVE_TERMINAL_REQUIRED');
  const hiddenOutput = new Writable({write(_chunk, _encoding, done) { done(); }});
  const prompt = createInterface({input: process.stdin, output: hiddenOutput, terminal: true, historySize: 0});
  prompt.once('SIGINT', () => process.exit(130));
  async function ask(label) {
    process.stdout.write(label);
    try { return await prompt.question(''); }
    finally { process.stdout.write('\n'); }
  }
  try {
    if (process.argv.includes('--verify')) return await ask('Existing reviewer password (hidden): ');
    const first = await ask('New reviewer password (12–128 characters, hidden): ');
    const confirmation = await ask('Confirm password (hidden): ');
    if (first !== confirmation || first.length < 12 || first.length > 128) {
      throw Error('PASSWORD_MISMATCH_OR_INVALID_LENGTH');
    }
    return first;
  } finally {
    prompt.close();
  }
}

try {
  const c = readReviewerConfig();
  const verify = process.argv.includes('--verify');
  if (verify && (!c.passwordConfigured || !process.argv.includes('--terminal'))) {
    throw Error('CONFIGURED_PASSWORD_AND_TERMINAL_REQUIRED');
  }
  const password = await readPassword();
  if (verify) {
    const expected = Buffer.from(c.passwordHash, 'hex');
    const actual = scryptSync(password, c.salt, 64);
    if (!timingSafeEqual(expected, actual)) throw Error('PASSWORD_DOES_NOT_MATCH');
  } else {
    c.salt = randomBytes(16).toString('hex');
    c.passwordHash = scryptSync(password, c.salt, 64).toString('hex');
    c.passwordConfigured = true;
    fs.writeFileSync(configFile, JSON.stringify(c, null, 2));
    console.log('Private reviewer password configured for ' + c.username + '.');
  }
if(process.argv.includes('--smoke')){const test=fileURLToPath(new URL('../../website/tests/reviewer-smoke.mjs',import.meta.url));const run=spawnSync(process.execPath,[test,'--allow-synthetic-dev-review'],{cwd:fileURLToPath(new URL('../../website/',import.meta.url)),input:JSON.stringify({username:c.username,password}),encoding:'utf8',windowsHide:true,timeout:150000,maxBuffer:16000});console.log(run.stdout.trim());if(run.status!==0){console.error('Bounded reviewer smoke did not complete successfully; private diagnostics withheld.');process.exitCode=1;}}
}catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'PRIVATE_PASSWORD_SETUP_FAILED');process.exitCode=1;}
