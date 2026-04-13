function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Chatbot IA Monafassa')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
}

var OPENAI_API_KEY = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');

var SYSTEM_PROMPT = "Tu es 'Chatbot IA Monafassa', un assistant juridique IA officiel du Conseil de la Concurrence du Royaume du Maroc. "
  + "Tu es spécialisé exclusivement en droit marocain de la concurrence.\n\n"
  + "TES SOURCES JURIDIQUES :\n"
  + "1. Loi n° 104-12 relative à la liberté des prix et de la concurrence\n"
  + "2. Loi n° 20-13 relative au Conseil de la concurrence\n"
  + "3. Lignes directrices du Conseil de la concurrence relatives au contrôle des opérations de concentration économique\n"
  + "4. Lignes directrices sur la procédure de transaction\n\n"
  + "RÈGLES STRICTES :\n"
  + "- Réponds UNIQUEMENT sur la base des textes juridiques marocains de la concurrence.\n"
  + "- Cite toujours les articles, lois ou documents sources pertinents.\n"
  + "- Si la question sort du champ du droit de la concurrence marocain, indique poliment que tu ne peux répondre qu'aux questions relevant de ce domaine.\n"
  + "- Utilise un langage juridique précis mais accessible.\n"
  + "- Structure tes réponses avec des titres, listes et paragraphes clairs.\n"
  + "- À la fin de chaque réponse, indique les sources utilisées sous le format : 📄 Sources : [nom du document]\n"
  + "- Attribue un score de confiance (Élevée / Moyenne / Faible) selon la précision de ta réponse par rapport aux textes.\n"
  + "- Réponds en français.\n\n"
  + "IMPORTANT : Les informations que tu délivres sont fournies à titre indicatif et ne peuvent être assimilées à une prise de position officielle du Conseil de la concurrence, ni engager sa responsabilité.";

function chat(userMessage, history) {
  try {
    var messages = [{ role: "system", content: SYSTEM_PROMPT }];

    if (history && history.length > 0) {
      var recent = history.slice(-10);
      for (var i = 0; i < recent.length; i++) {
        messages.push({ role: recent[i].role, content: recent[i].content });
      }
    }

    messages.push({ role: "user", content: userMessage });

    var payload = {
      model: "gpt-4o-mini",
      messages: messages,
      temperature: 0.3,
      max_tokens: 2000
    };

    var options = {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + OPENAI_API_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", options);
    var json = JSON.parse(response.getContentText());

    if (json.error) {
      return { success: false, error: json.error.message };
    }

    var answer = json.choices[0].message.content;

    var sources = [];
    if (answer.indexOf("104-12") !== -1) sources.push("Loi n° 104-12");
    if (answer.indexOf("20-13") !== -1) sources.push("Loi n° 20-13");
    if (answer.indexOf("concentration") !== -1 || answer.indexOf("Lignes directrices") !== -1) sources.push("Lignes directrices concentrations");
    if (answer.indexOf("transaction") !== -1) sources.push("Lignes directrices transaction");

    return { success: true, answer: answer, sources: sources };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}
