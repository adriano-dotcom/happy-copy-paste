"use client";

import { cn } from "@/lib/utils";
import { Link, LinkProps } from "react-router-dom";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <>
      <DesktopSidebar className={className}>{children}</DesktopSidebar>
      <MobileSidebar className={className}>{children}</MobileSidebar>
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        "h-full px-4 py-4 hidden md:flex md:flex-col w-[260px] flex-shrink-0",
        className
      )}
      animate={{
        width: animate ? (open ? "260px" : "76px") : "260px",
      }}
      transition={{
        duration: 0.3,
        ease: "easeInOut",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "h-14 px-4 py-4 flex flex-row md:hidden items-center justify-between bg-slate-950/80 backdrop-blur-xl w-full border-b border-slate-800/50"
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <Menu
            className="text-slate-200 cursor-pointer hover:text-cyan-400 transition-colors"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-slate-950 p-10 z-[100] flex flex-col justify-between",
                className
              )}
            >
              <div
                className="absolute right-10 top-10 z-50 text-slate-200 cursor-pointer hover:text-cyan-400 transition-colors"
                onClick={() => setOpen(!open)}
              >
                <X />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  isActive,
  onClick,
  badge,
  ...props
}: {
  link: Links;
  className?: string;
  isActive?: boolean;
  onClick?: () => void;
  badge?: number;
  props?: Omit<LinkProps, 'to'>;
}) => {
  const { open, animate, setOpen } = useSidebar();
  
  // Close mobile sidebar on navigation
  const handleClick = () => {
    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      setOpen(false);
    }
    onClick?.();
  };
  
  return (
    <Link
      to={link.href}
      onClick={handleClick}
      className={cn(
        "flex items-center justify-start gap-3 group/sidebar py-3 px-3 rounded-xl transition-all duration-200 relative overflow-hidden",
        isActive
          ? "bg-slate-800/80 text-cyan-400 shadow-lg shadow-black/20 ring-1 ring-slate-700/50"
          : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200",
        className
      )}
      {...props}
    >
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500 rounded-l-md shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
      )}
      <span className={cn(
        "flex-shrink-0 transition-colors relative",
        isActive ? "text-cyan-400" : "text-slate-500 group-hover/sidebar:text-slate-300"
      )}>
        {link.icon}
        {/* Badge when collapsed */}
        {badge && badge > 0 && !open && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1 shadow-lg shadow-red-500/30 animate-pulse">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut",
        }}
        className={cn(
          "text-sm font-medium group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre flex-1",
          isActive && "text-cyan-50"
        )}
      >
        {link.label}
      </motion.span>
      {/* Badge when expanded */}
      {badge && badge > 0 && open && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="min-w-[22px] h-[22px] flex items-center justify-center text-[11px] font-bold bg-red-500 text-white rounded-full px-1.5 shadow-lg shadow-red-500/30"
        >
          {badge > 99 ? '99+' : badge}
        </motion.span>
      )}
    </Link>
  );
};
