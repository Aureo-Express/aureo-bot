const qrcode = require('qrcode-terminal');
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

const conversas = {};

client.on('qr', qr => {
    console.log("🔄 Escaneie o QR code abaixo para conectar:");
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp conectado com sucesso!');
});

client.initialize();

// Atendimento automático
client.on('message', async msg => {
    const contato = await msg.getContact();
    const nome = contato.pushname || "cliente";
    const telefone = msg.from;
    const texto = msg.body.toLowerCase().trim();

    if (!conversas[telefone]) conversas[telefone] = { etapa: 0 };

    const etapa = conversas[telefone].etapa;

    if (["oi", "bom dia", "boa tarde", "boa noite"].some(p => texto.includes(p))) {
        await client.sendMessage(telefone, `*Gabriela Lima*\nOlá, ${nome}! Tudo bem? 😊\nSou *Gabriela Lima*, da Áureo Express. Como posso te ajudar hoje?\n\n1️⃣ Fazer um novo pedido\n2️⃣ Acompanhar pedido\n3️⃣ Tenho dúvidas`);
        conversas[telefone].etapa = 1;
        return;
    }

    switch (etapa) {
        case 1:
            if (texto === "1") {
                await client.sendMessage(telefone, `*Gabriela Lima*\nÓtimo! Qual produto você deseja adquirir?`);
                conversas[telefone].etapa = 2;
            } else if (texto === "2") {
                await client.sendMessage(telefone, `*Gabriela Lima*\nClaro! Me informe seu *nome completo* para localizar o pedido.`);
                conversas[telefone].etapa = 10;
            } else if (texto === "3") {
                await client.sendMessage(telefone, `*Gabriela Lima*\nPode mandar sua dúvida aqui que eu te ajudo rapidinho! 💬`);
                conversas[telefone].etapa = 20;
            } else {
                await client.sendMessage(telefone, `*Gabriela Lima*\nDigite apenas *1*, *2* ou *3* para que eu possa continuar 💛`);
            }
            break;

        case 2:
            conversas[telefone].produto = texto;
            await client.sendMessage(telefone, `*Gabriela Lima*\nPerfeito. Envie seu *endereço completo com CEP* para o envio.`);
            conversas[telefone].etapa = 3;
            break;

        case 3:
            conversas[telefone].endereco = texto;
            await client.sendMessage(telefone, `*Gabriela Lima*\nEndereço recebido! ✅\nComo deseja pagar?\n1️⃣ Pix\n2️⃣ Cartão`);
            conversas[telefone].etapa = 4;
            break;

        case 4:
            if (texto === "1") {
                await client.sendMessage(telefone, `*Gabriela Lima*\n🔑 Chave Pix: *CNPJ 59800036000100*\n💵 Valor: *R$129,00*`);
            } else if (texto === "2") {
                await client.sendMessage(telefone, `*Gabriela Lima*\n🔗 Link para pagar com cartão:\nhttps://aureo-express.pay.yampi.com.br/r/O839CRL949`);
            } else {
                await client.sendMessage(telefone, `*Gabriela Lima*\nEscolha *1* para Pix ou *2* para Cartão.`);
                return;
            }
            conversas[telefone].etapa = 5;
            setTimeout(() => {
                client.sendMessage(telefone, `*Gabriela Lima*\nVocê conseguiu pagar? Se precisar de ajuda, estou aqui! 💛`);
            }, 10 * 60 * 1000);
            break;

        case 5:
            await client.sendMessage(telefone, `*Gabriela Lima*\nSeu pedido está sendo processado! 📦`);
            conversas[telefone].etapa = 0;
            break;

        case 10:
            conversas[telefone].nomeCliente = texto;
            await client.sendMessage(telefone, `*Gabriela Lima*\nVerificando... aguarde 🔎`);
            setTimeout(() => {
                client.sendMessage(telefone, `*Gabriela Lima*\nSeu pedido está *em trânsito*! 🚚`);
            }, 5000);
            conversas[telefone].etapa = 0;
            break;

        case 20:
            await client.sendMessage(telefone, `*Gabriela Lima*\nObrigada pela dúvida! Um atendente vai verificar 😉`);
            conversas[telefone].etapa = 0;
            break;

        default:
            await client.sendMessage(telefone, `*Gabriela Lima*\nNão entendi 😅. Digite *oi* para começar do zero.`);
            conversas[telefone].etapa = 0;
    }
});

// Webhook da Yampi com validação da chave secreta
app.post('/webhook-yampi', async (req, res) => {
    const secretRecebido = req.headers['x-yampi-webhook-secret'];
    const chaveEsperada = "wh_Wyz0t8ddRjjoiWcQa2KLmjtcZTahe1SpvxxpQ";

    if (secretRecebido !== chaveEsperada) {
        console.log("❌ Webhook rejeitado: chave secreta inválida");
        return res.sendStatus(401);
    }

    console.log("📦 Webhook recebido da Yampi:", req.body);

    const pedido = req.body;
    const nome = pedido?.customer?.name;
    const telefone = pedido?.customer?.phone;
    const pagamento = pedido?.payment;
    const pagamentos = Array.isArray(pagamento) ? pagamento : [pagamento];

    if (telefone && nome) {
        let mensagem = `*Gabriela Lima*\nOi, ${nome}! 😍 Recebemos seu pedido!`;

        for (const p of pagamentos) {
            if (p.method === "pix" && p.pix?.code) {
                mensagem += `\n\n💰 *Pagamento via Pix:*\n\`\`\`${p.pix.code}\`\`\``;
            } else if (p.method === "boleto" && p.boleto?.barcode) {
                mensagem += `\n\n📄 *Boleto bancário:*\n\`\`\`${p.boleto.barcode}\`\`\``;
                if (p.boleto.link) {
                    mensagem += `\nLink do boleto: ${p.boleto.link}`;
                }
            }
        }

        mensagem += `\n\nAssim que o pagamento for confirmado, te envio o rastreio! 🧡`;

        await client.sendMessage(`${telefone}@c.us`, mensagem);
    }

    res.sendStatus(200);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor online na porta ${PORT}`);
});
