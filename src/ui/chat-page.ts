export function renderChatPage(apiPrefix: string): string {
  const endpoint = JSON.stringify(
    `/${encodeURIComponent(apiPrefix)}/llm/generate`,
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kontur · Test chat</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #222b29; background: #f4f5f1; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { max-width: 860px; margin: auto; height: 100dvh; min-height: 420px; display: flex; flex-direction: column; padding: 24px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid #dce0d8; }
    h1 { margin: 0; font-size: 23px; letter-spacing: -0.7px; }
    header p { margin: 5px 0 0; color: #59655e; font-size: 14px; }
    .badge { font-size: 12px; font-weight: 600; border: 1px solid #cbd5c6; border-radius: 20px; padding: 7px 12px; white-space: nowrap; }
    #messages { flex: 1; overflow-y: auto; padding: 24px 0; }
    #welcome { padding: 35px 0; max-width: 530px; }
    h2 { font-size: 30px; font-weight: 550; letter-spacing: -1px; margin: 0 0 12px; }
    #welcome p { line-height: 1.6; color: #59655e; }
    .suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
    button { font: inherit; cursor: pointer; }
    .suggestions button { border: 1px solid #d5dbd1; background: #fff; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #34483e; }
    .message { max-width: 88%; margin: 0 0 20px; }
    .message.user { margin-left: auto; }
    .role { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #59655e; margin: 0 0 6px 3px; }
    .user .role { text-align: right; }
    .bubble { padding: 14px 17px; background: white; border: 1px solid #dce0d8; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; font-size: 15px; }
    .user .bubble { background: #254b3b; color: #fff; border-color: #254b3b; }
    .message.failed .bubble { border-color: #bc4e36; }
    form { padding-top: 8px; }
    label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .composer { display: flex; align-items: flex-end; gap: 12px; background: #fff; padding: 12px; border: 1px solid #cbd5c6; border-radius: 14px; }
    textarea { flex: 1; resize: none; min-width: 0; max-height: 180px; border: 0; background: transparent; font: inherit; line-height: 1.5; padding: 6px; color: inherit; }
    textarea:focus { outline: none; }
    .composer:focus-within { outline: 2px solid #6c8e78; outline-offset: 2px; }
    #send { background: #254b3b; color: #fff; border: 0; border-radius: 9px; padding: 12px 20px; font-weight: 600; }
    button:disabled { opacity: .5; cursor: default; }
    button:focus-visible { outline: 2px solid #6c8e78; outline-offset: 3px; }
    #status { min-height: 22px; margin: 9px 0 0; font-size: 13px; color: #59655e; }
    #status.error { color: #a13220; }
    .note { font-size: 11px; color: #59655e; margin: 6px 0 0; line-height: 1.5; }
    @media (max-width: 540px) { main { padding: 16px; } h2 { font-size: 26px; } .message { max-width: 95%; } #send { padding: 12px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>Kontur</h1><p>Barbershop assistant</p></div>
      <span class="badge">Test chat</span>
    </header>
    <section id="messages" role="log" aria-label="Conversation" aria-live="polite">
      <div id="welcome">
        <h2>Start a conversation.</h2>
        <p>Explore services, prepare a booking request, or ask a question using Wikipedia.</p>
        <div class="suggestions">
          <button type="button">What services do you offer?</button>
          <button type="button">I'd like a haircut tomorrow.</button>
          <button type="button">Find the history of barbershops on Wikipedia.</button>
        </div>
      </div>
    </section>
    <form id="chat-form">
      <label for="prompt">Your message</label>
      <div class="composer">
        <textarea id="prompt" rows="2" maxlength="10000" required placeholder="Ask the assistant…" aria-describedby="status"></textarea>
        <button id="send" type="submit" disabled>Send</button>
      </div>
      <p id="status" role="status">Enter to send · Shift + Enter for a new line</p>
      <p class="note">This test chat shares server conversation history. Reloading clears the display; restart the server to reset the conversation.</p>
    </form>
  </main>
  <script>
    const endpoint = ${endpoint};
    const form = document.querySelector('#chat-form');
    const prompt = document.querySelector('#prompt');
    const send = document.querySelector('#send');
    const messages = document.querySelector('#messages');
    const status = document.querySelector('#status');
    let pending = false;

    function updateSendButton() {
      send.disabled = pending || !prompt.value.trim();
    }

    function addMessage(role, text) {
      document.querySelector('#welcome')?.remove();
      const message = document.createElement('article');
      const label = document.createElement('p');
      const bubble = document.createElement('div');
      message.className = 'message ' + role;
      label.className = 'role';
      label.textContent = role === 'user' ? 'You' : 'Kontur';
      bubble.className = 'bubble';
      bubble.textContent = text;
      message.append(label, bubble);
      messages.append(message);
      messages.scrollTop = messages.scrollHeight;

      return message;
    }

    function responseText(response) {
      try {
        const parsed = JSON.parse(response);
        if (parsed && typeof parsed.agentText === 'string') {
          return parsed.agentText;
        }
      } catch {
        // Plain text responses are also supported.
      }

      return response;
    }

    prompt.addEventListener('input', updateSendButton);
    prompt.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!send.disabled) {
          form.requestSubmit();
        }
      }
    });

    document.querySelectorAll('.suggestions button').forEach((button) => {
      button.addEventListener('click', () => {
        prompt.value = button.textContent;
        updateSendButton();
        prompt.focus();
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = prompt.value.trim();
      if (pending || !text) {
        return;
      }

      pending = true;
      prompt.value = '';
      prompt.disabled = true;
      updateSendButton();
      send.textContent = 'Waiting…';
      status.className = '';
      status.textContent = 'The assistant is replying…';
      const userMessage = addMessage('user', text);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text }),
        });
        if (!response.ok) {
          throw new Error(response.status === 502
            ? 'The assistant could not respond. Please try again.'
            : 'Request failed (' + response.status + '). Please try again.');
        }

        const data = await response.json();
        if (typeof data.response !== 'string') {
          throw new Error('Unexpected response. Please try again.');
        }

        addMessage('assistant', responseText(data.response));
        status.textContent = 'Enter to send · Shift + Enter for a new line';
      } catch (error) {
        userMessage.classList.add('failed');
        userMessage.querySelector('.role').textContent = 'You · response failed';
        status.className = 'error';
        status.textContent = error instanceof TypeError
          ? 'Cannot reach the server. Check your connection and try again.'
          : error.message;
        prompt.value = text;
      } finally {
        pending = false;
        prompt.disabled = false;
        send.textContent = 'Send';
        updateSendButton();
        prompt.focus();
      }
    });
  </script>
</body>
</html>`;
}
