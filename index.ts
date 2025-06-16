interface ApiResponse {
  status: string;
  text: string;
  message: string;
  data?: any;
}

interface Balance {
  RUB: number;
  USD: number;
}

interface Transaction {
  id: number;
  fromUid: number;
  toUid: number;
  currency: 'RUB' | 'USD';
  amount: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  timestamp: string;
}

class User {
  public uid: number;
  public login: string;
  public password: string;
  public phone: string;
  public age: string;
  public verification: boolean = false;
  public online: boolean = false;
  public cardNumber?: string;
  public geo?: string;
  public balance: Balance = { RUB: 10000, USD: 100 };
  public transactionHistory: Transaction[] = [];

  private static nextTransactionId: number = 1;

  constructor(uid: number, login: string, password: string, phone: string = "", age: string = "") {
    this.uid = uid;
    this.login = login;
    this.password = password;
    this.phone = phone;
    this.age = age;
  }
  

  signIn(login: string, password: string): ApiResponse {
    if (this.login === login && this.password === password) {
      this.online = true;
      return { status: "200", text: "OK", message: "Вход выполнен успешно" };
    }
    return { status: "401", text: "Unauthorized", message: "Неправильные данные для входа" };
  }

  static users: User[] = [];
  static nextUid: number = 1;

  static signUp(login: string, password: string, passwordRepeat: string): ApiResponse {
    if (login.length < 3 || login.length > 20) {
      return { status: "400", text: "Bad Request", message: "Логин должен быть от 3 до 20 символов" };
    }
    if (password.length < 6) {
      return { status: "400", text: "Bad Request", message: "Пароль слишком короткий" };
    }
    if (password !== passwordRepeat) {
      return { status: "400", text: "Bad Request", message: "Пароли не совпадают" };
    }
    if (User.users.some(u => u.login === login)) {
      return { status: "409", text: "Conflict", message: "Этот логин уже используется" };
    }

    const loginPattern = /^[a-zA-Z0-9]+$/;
    if (!loginPattern.test(login)) {
      return { status: "400", text: "Bad Request", message: "Логин содержит недопустимые символы" };
    }

    const newUser = new User(User.nextUid++, login, password);
    User.users.push(newUser);
    return newUser.signIn(login, password);
  }

  static verify(login: string, phone: string, age: string, cardNumber?: string, geo?: string): ApiResponse {
    const targetUser = User.users.find(u => u.login === login);
    if (!targetUser) {
      return { status: "404", text: "Not Found", message: "Пользователь не найден" };
    }

    targetUser.phone = phone;
    targetUser.age = age;
    targetUser.cardNumber = cardNumber;
    targetUser.geo = geo;
    targetUser.verification = true;

    return { status: "200", text: "OK", message: "Верификация завершена успешно" };
  }

  static forgetPwd(login: string, phone: string, newPassword: string): ApiResponse {
    const user = User.users.find(u => u.login === login);
    if (!user) {
      return { status: "404", text: "Not Found", message: "Пользователь не найден" };
    }
    if (user.phone !== phone) {
      return { status: "401", text: "Unauthorized", message: "Телефон не совпадает" };
    }
    if (newPassword.length < 6) {
      return { status: "400", text: "Bad Request", message: "Пароль слишком короткий" };
    }

    user.password = newPassword;
    return { status: "200", text: "OK", message: "Пароль успешно обновлён" };
  }

  static transactionTrigger(fromUid: number, toUid: number, currency: 'RUB' | 'USD', amount: number): ApiResponse {
    const sender = User.users.find(u => u.uid === fromUid);
    const recipient = User.users.find(u => u.uid === toUid);

    if (!sender || !recipient) {
      return { status: "404", text: "Not Found", message: "Пользователь не найден" };
    }
    if (sender.uid === recipient.uid) {
      return { status: "400", text: "Bad Request", message: "Нельзя отправить себе" };
    }
    if (amount <= 0) {
      return { status: "400", text: "Bad Request", message: "Сумма должна быть больше нуля" };
    }
    if (sender.balance[currency] < amount) {
      return { status: "400", text: "Bad Request", message: "Недостаточно средств" };
    }

    const tx: Transaction = {
      id: User.nextTransactionId++,
      fromUid,
      toUid,
      currency,
      amount,
      status: 'PENDING',
      timestamp: new Date().toISOString()
    };

    sender.transactionHistory.push(tx);
    recipient.transactionHistory.push(tx);

    return { status: "200", text: "OK", message: "Транзакция создана" };
  }

  static transactionReceive(transactionId: number, receiverUid: number, accept: boolean): ApiResponse {
    const receiver = User.users.find(u => u.uid === receiverUid);
    if (!receiver) {
      return { status: "404", text: "Not Found", message: "Получатель не найден" };
    }

    const transaction = receiver.transactionHistory.find(t => t.id === transactionId && t.status === 'PENDING');
    if (!transaction) {
      return { status: "404", text: "Not Found", message: "Транзакция не найдена или уже обработана" };
    }

    const sender = User.users.find(u => u.uid === transaction.fromUid);
    if (!sender) {
      return { status: "404", text: "Not Found", message: "Отправитель не найден" };
    }

    if (!accept) {
      transaction.status = 'REJECTED';
      sender.transactionHistory.find(t => t.id === transactionId)!.status = 'REJECTED';
      return { status: "200", text: "OK", message: "Транзакция отклонена" };
    }

    const exchangeRate = { USD: 100, RUB: 0.01 };
    const opposite = transaction.currency === 'USD' ? 'RUB' : 'USD';
    const required = transaction.amount * exchangeRate[transaction.currency];

    if (receiver.balance[opposite] < required) {
      transaction.status = 'REJECTED';
      sender.transactionHistory.find(t => t.id === transactionId)!.status = 'REJECTED';
      return { status: "400", text: "Bad Request", message: "Недостаточно средств у получателя" };
    }

    sender.balance[transaction.currency] -= transaction.amount;
    receiver.balance[transaction.currency] += transaction.amount;
    receiver.balance[opposite] -= required;
    sender.balance[opposite] += required;

    transaction.status = 'ACCEPTED';
    sender.transactionHistory.find(t => t.id === transactionId)!.status = 'ACCEPTED';

    return { status: "200", text: "OK", message: "Транзакция завершена" };
  }

  static toggleOnlineStatus(uid: number, online: boolean): ApiResponse {
    const user = User.users.find(u => u.uid === uid);
    if (!user) {
      return { status: "404", text: "Not Found", message: "Пользователь не найден" };
    }
    user.online = online;
    return { status: "200", text: "OK", message: `Пользователь теперь ${online ? "онлайн" : "офлайн"}` };
  }
}

console.log(User.signUp("user_1", "123123", "123123"));
console.log(User.signUp("user_2", "321321", "321321"));
console.log(User.verify("user_1", "8800553535", "18", "1234-5678", "Vladivostok"));
console.log(User.forgetPwd("user_1", "8800553535", "123123123"));
console.log(User.users[0].signIn("user_1", "123123123"));
console.log(User.transactionTrigger(1, 2, "USD", 20));
console.log(User.transactionReceive(1, 2, true));
console.log(User.toggleOnlineStatus(2, true));


