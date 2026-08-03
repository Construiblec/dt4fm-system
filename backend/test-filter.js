async function test() {
  try {
    const loginRes = await fetch('http://187.77.250.224:8091/cmdbuild/services/rest/v3/sessions?scope=service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'angel.supervisor', password: 'password123' })
    });
    const login = await loginRes.json();
    console.log(login);
  } catch (err) {
    console.error('ERROR RESPONSE:', err.message);
  }
}
test();
