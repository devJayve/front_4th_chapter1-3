import { User } from "./entities";
import { Notification } from "./entities";

export interface UserContextType {
  user: User | null;
  login: (email: string, password: string) => void;
  logout: () => void;
}

export interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string, type: Notification["type"]) => void;
  removeNotification: (id: number) => void;
}

export interface ThemeContextType {
  theme: string;
  toggleTheme: () => void;
}